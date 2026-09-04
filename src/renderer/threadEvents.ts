import type { CodexEvent, CodexItem, CodexThread, CodexTurn, SkillReference } from "../shared/types";

function eventThreadId(event: CodexEvent) {
  return typeof event.params?.threadId === "string" ? event.params.threadId : undefined;
}

function eventTurnId(event: CodexEvent) {
  if (typeof event.params?.turnId === "string") return event.params.turnId;
  const turn = event.params?.turn;
  return turn && typeof turn === "object" && typeof (turn as Record<string, unknown>).id === "string"
    ? (turn as Record<string, unknown>).id as string
    : undefined;
}

function upsertItem(turn: CodexTurn, item: CodexItem): CodexTurn {
  const index = turn.items.findIndex((current) => current.id && current.id === item.id);
  if (index < 0) return { ...turn, items: turn.items.concat(item) };
  const items = [...turn.items];
  items[index] = { ...items[index], ...item };
  return { ...turn, items };
}

function updateItem(turn: CodexTurn, itemId: string, fallbackType: string, patch: (item: CodexItem) => CodexItem) {
  const existing = turn.items.find((item) => item.id === itemId) ?? { id: itemId, type: fallbackType };
  return upsertItem(turn, patch(existing));
}

function ensureTurn(thread: CodexThread, turnId: string): CodexThread {
  if (thread.turns?.some((turn) => turn.id === turnId)) return thread;
  return { ...thread, turns: [...(thread.turns ?? []), { id: turnId, status: "inProgress", items: [] }] };
}

function updateTurn(thread: CodexThread, turnId: string, update: (turn: CodexTurn) => CodexTurn): CodexThread {
  const next = ensureTurn(thread, turnId);
  return { ...next, turns: (next.turns ?? []).map((turn) => turn.id === turnId ? update(turn) : turn) };
}

export function optimisticTurn(thread: CodexThread, turnId: string, text: string, imagePaths: string[] = [], skills: SkillReference[] = []) {
  const content: Array<Record<string, unknown>> = [
    ...(text ? [{ type: "text", text, text_elements: [] }] : []),
    ...imagePaths.map((path) => ({ type: "localImage", path })),
    ...skills.map((skill) => ({ type: "skill", name: skill.name, path: skill.path, displayName: skill.displayName })),
  ];
  return updateTurn(thread, turnId, (turn) => upsertItem(turn, {
    id: `optimistic-user-${turnId}`,
    type: "userMessage",
    content,
    optimistic: true,
  }));
}

export function failOptimisticTurn(thread: CodexThread, turnId: string, message: string) {
  if (!thread.turns?.some((turn) => turn.id === turnId)) return thread;
  return {
    ...thread,
    turns: thread.turns.map((turn) => turn.id === turnId
      ? { ...turn, status: "failed", error: { message } }
      : turn),
  };
}

/** Applies one App Server notification to the selected Thread/Turn/Item graph. */
export function applyCodexEvent(thread: CodexThread | null, event: CodexEvent): CodexThread | null {
  if (!thread) return thread;
  const threadId = eventThreadId(event);
  if (threadId && threadId !== thread.id) return thread;
  const turnId = eventTurnId(event);

  if (event.method === "thread/status/changed") return { ...thread, status: event.params?.status };
  if (event.method === "thread/name/updated") return { ...thread, name: String(event.params?.name ?? thread.name ?? "") };
  if (event.method === "thread/archived") return { ...thread, archived: true };
  if (event.method === "thread/unarchived") return { ...thread, archived: false };
  if (!turnId) return thread;

  if (event.method === "turn/started") {
    const incoming = event.params?.turn && typeof event.params.turn === "object" ? event.params.turn as Record<string, unknown> : {};
    return updateTurn(thread, turnId, (turn) => ({ ...turn, ...incoming, id: turnId, status: String(incoming.status ?? "inProgress"), items: turn.items }));
  }
  if (event.method === "turn/completed") {
    const incoming = event.params?.turn && typeof event.params.turn === "object" ? event.params.turn as Record<string, unknown> : {};
    return updateTurn(thread, turnId, (turn) => ({
      ...turn,
      status: String(incoming.status ?? "completed"),
      error: incoming.error,
      startedAt: typeof incoming.startedAt === "number" ? incoming.startedAt : turn.startedAt,
      completedAt: typeof incoming.completedAt === "number" ? incoming.completedAt : Date.now() / 1000,
      durationMs: typeof incoming.durationMs === "number" ? incoming.durationMs : turn.durationMs,
    }));
  }
  if (event.method === "item/started" || event.method === "item/completed") {
    const item = event.params?.item;
    if (!item || typeof item !== "object" || Array.isArray(item)) return thread;
    return updateTurn(thread, turnId, (turn) => {
      const withoutOptimistic = (item as CodexItem).type === "userMessage"
        ? { ...turn, items: turn.items.filter((current) => !current.optimistic) }
        : turn;
      return upsertItem(withoutOptimistic, item as CodexItem);
    });
  }

  const itemId = typeof event.params?.itemId === "string" ? event.params.itemId : `${event.method}-${turnId}`;
  const delta = typeof event.params?.delta === "string" ? event.params.delta : "";
  if (event.method === "item/agentMessage/delta") {
    return updateTurn(thread, turnId, (turn) => updateItem(turn, itemId, "agentMessage", (item) => ({ ...item, type: "agentMessage", text: String(item.text ?? "") + delta })));
  }
  if (event.method === "item/plan/delta") {
    return updateTurn(thread, turnId, (turn) => updateItem(turn, itemId, "plan", (item) => ({ ...item, type: "plan", text: String(item.text ?? "") + delta })));
  }
  if (event.method === "item/reasoning/summaryTextDelta" || event.method === "item/reasoning/textDelta") {
    return updateTurn(thread, turnId, (turn) => updateItem(turn, itemId, "reasoning", (item) => {
      const summary = Array.isArray(item.summary) ? item.summary.map(String) : [];
      const index = Number(event.params?.summaryIndex ?? 0);
      while (summary.length <= index) summary.push("");
      summary[index] += delta;
      return { ...item, type: "reasoning", summary };
    }));
  }
  if (event.method === "item/commandExecution/outputDelta") {
    return updateTurn(thread, turnId, (turn) => updateItem(turn, itemId, "commandExecution", (item) => ({ ...item, type: "commandExecution", status: "inProgress", aggregatedOutput: String(item.aggregatedOutput ?? "") + delta })));
  }
  if (event.method === "turn/plan/updated") {
    const plan = Array.isArray(event.params?.plan) ? event.params?.plan : [];
    const text = plan.map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return `${row.status === "completed" ? "✓" : row.status === "inProgress" ? "→" : "○"} ${String(row.step ?? "")}`;
    }).join("\n");
    return updateTurn(thread, turnId, (turn) => upsertItem(turn, { id: `plan-${turnId}`, type: "plan", text }));
  }
  if (event.method === "turn/diff/updated") {
    return updateTurn(thread, turnId, (turn) => upsertItem(turn, { id: `diff-${turnId}`, type: "diff", diff: String(event.params?.diff ?? "") }));
  }
  if (event.method === "aiyou/approvalRequested" || event.method === "aiyou/approvalResolved") {
    const requestId = String(event.params?.requestId ?? itemId);
    return updateTurn(thread, turnId, (turn) => upsertItem(turn, {
      id: `approval-${requestId}`,
      type: "approval",
      method: String(event.params?.approvalMethod ?? "approval"),
      status: String(event.params?.decision ?? (event.method === "aiyou/approvalRequested" ? "awaiting" : "resolved")),
      details: event.params?.details,
    }));
  }
  if (event.method === "error") {
    const error = event.params?.error && typeof event.params.error === "object" ? event.params.error as Record<string, unknown> : {};
    return updateTurn(thread, turnId, (turn) => upsertItem(turn, { id: `error-${turnId}`, type: "error", message: String(error.message ?? "Agent 执行失败") }));
  }
  return thread;
}
