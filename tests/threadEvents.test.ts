import { describe, expect, it } from "vitest";
import type { CodexEvent, CodexThread } from "../src/shared/types";
import { applyCodexEvent, optimisticTurn } from "../src/renderer/threadEvents";

const baseThread: CodexThread = {
  id: "thread-1",
  preview: "",
  cwd: "/workspace",
  updatedAt: 1,
  turns: [],
};

function apply(thread: CodexThread, method: string, params: CodexEvent["params"]) {
  return applyCodexEvent(thread, { method, params })!;
}

describe("Codex event timeline reducer", () => {
  it("keeps one persistent Turn while text, reasoning and commands stream", () => {
    let thread = optimisticTurn(baseThread, "turn-1", "修复测试");
    thread = apply(thread, "turn/started", { threadId: "thread-1", turn: { id: "turn-1", status: "inProgress" } });
    thread = apply(thread, "item/completed", { threadId: "thread-1", turnId: "turn-1", item: { id: "user-1", type: "userMessage", content: [{ type: "text", text: "修复测试" }] } });
    thread = apply(thread, "item/reasoning/summaryTextDelta", { threadId: "thread-1", turnId: "turn-1", itemId: "reason-1", delta: "检查失败", summaryIndex: 0 });
    thread = apply(thread, "item/commandExecution/outputDelta", { threadId: "thread-1", turnId: "turn-1", itemId: "cmd-1", delta: "PASS\n" });
    thread = apply(thread, "item/agentMessage/delta", { threadId: "thread-1", turnId: "turn-1", itemId: "answer-1", delta: "已经修复" });
    const turn = thread.turns?.[0];
    expect(thread.turns).toHaveLength(1);
    expect(turn?.items.some((item) => item.optimistic)).toBe(false);
    expect(turn?.items.find((item) => item.id === "reason-1")?.summary).toEqual(["检查失败"]);
    expect(turn?.items.find((item) => item.id === "cmd-1")?.aggregatedOutput).toBe("PASS\n");
    expect(turn?.items.find((item) => item.id === "answer-1")?.text).toBe("已经修复");
  });

  it("records interruption and ignores events from another Thread", () => {
    let thread = apply(baseThread, "turn/started", { threadId: "thread-1", turn: { id: "turn-1", status: "inProgress" } });
    thread = apply(thread, "item/agentMessage/delta", { threadId: "thread-2", turnId: "turn-x", itemId: "wrong", delta: "ignore" });
    thread = apply(thread, "turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status: "interrupted" } });
    expect(thread.turns).toHaveLength(1);
    expect(thread.turns?.[0].status).toBe("interrupted");
    expect(thread.turns?.[0].items).toHaveLength(0);
  });
});
