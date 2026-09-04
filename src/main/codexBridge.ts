import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  AgentInput,
  ApprovalRequest,
  CodexEvent,
  CodexStatus,
  CodexThread,
  RuntimeCapabilitySnapshot,
  RuntimeSkillsSnapshot,
  SkillConfigWriteResult,
  ThreadListQuery,
} from "../shared/types";
import { parseSkillsListResponse } from "../shared/skills";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
};

type WireMessage = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string };
};

export class CodexBridge {
  private process: ChildProcessWithoutNullStreams | null = null;
  private requestId = 1;
  private pending = new Map<number | string, PendingRequest>();
  private command = "codex";
  private eventListeners = new Set<(event: CodexEvent) => void>();
  private approvalListeners = new Set<(request: ApprovalRequest) => void>();
  private lastError: string | undefined;
  private gatewayBaseUrl: string | undefined;
  private skillRootsSignature: string | undefined;
  private skillRootsPendingSignature: string | undefined;
  private skillRootsPending: Promise<void> | undefined;

  configureGateway(baseUrl: string) {
    if (this.process && !this.process.killed && this.gatewayBaseUrl !== baseUrl) {
      throw new Error("请先停止 Codex app-server 再切换 AIYOU gateway");
    }
    this.gatewayBaseUrl = baseUrl;
  }

  onEvent(listener: (event: CodexEvent) => void) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onApproval(listener: (request: ApprovalRequest) => void) {
    this.approvalListeners.add(listener);
    return () => this.approvalListeners.delete(listener);
  }

  status(): CodexStatus {
    return {
      connected: Boolean(this.process && !this.process.killed),
      command: this.command,
      error: this.lastError,
    };
  }

  async start(command = "codex"): Promise<CodexStatus> {
    if (this.process && !this.process.killed) return this.status();
    this.command = command;
    this.lastError = undefined;
    this.skillRootsSignature = undefined;
    this.skillRootsPendingSignature = undefined;
    this.skillRootsPending = undefined;
    const args = this.gatewayBaseUrl ? [
      "-c", 'model_providers.aiyou.name="AIYOU Gateway"',
      "-c", `model_providers.aiyou.base_url="${this.gatewayBaseUrl}"`,
      "-c", 'model_providers.aiyou.wire_api="responses"',
      "app-server", "--stdio",
    ] : ["app-server", "--stdio"];
    this.process = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, RUST_LOG: process.env.RUST_LOG ?? "error" },
    });

    this.process.on("error", (error) => {
      this.lastError = error.message;
      this.rejectAll(error);
    });
    this.process.on("exit", (code) => {
      const error = new Error(`Codex app-server 已退出（${code ?? "unknown"}）`);
      this.lastError = error.message;
      this.process = null;
      this.skillRootsSignature = undefined;
      this.skillRootsPendingSignature = undefined;
      this.skillRootsPending = undefined;
      this.rejectAll(error);
    });
    this.process.stderr.on("data", (chunk: Buffer) => {
      const value = chunk.toString("utf8").trim();
      if (value) this.lastError = value.slice(-500);
    });

    const lines = createInterface({ input: this.process.stdout });
    lines.on("line", (line) => this.handleLine(line));

    await this.request("initialize", {
      clientInfo: { name: "aiyou", title: "AIYOU", version: "0.3.2" },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: [],
      },
    });
    this.notify("initialized", {});
    return this.status();
  }

  async stop(): Promise<CodexStatus> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this.skillRootsSignature = undefined;
    this.skillRootsPendingSignature = undefined;
    this.skillRootsPending = undefined;
    this.rejectAll(new Error("Codex app-server 已停止"));
    return this.status();
  }

  private handleLine(line: string) {
    let message: WireMessage;
    try {
      message = JSON.parse(line) as WireMessage;
    } catch {
      const event: CodexEvent = { method: "aiyou/protocolError", params: { line: line.slice(0, 500) } };
      for (const listener of this.eventListeners) listener(event);
      return;
    }

    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? "Codex 请求失败"));
      else pending.resolve(message.result);
      return;
    }

    if (!message.method) return;
    if (message.id !== undefined) {
      const request: ApprovalRequest = {
        id: message.id,
        method: message.method,
        params: message.params ?? {},
      };
      for (const listener of this.approvalListeners) listener(request);
      return;
    }
    const event: CodexEvent = { method: message.method, params: message.params };
    for (const listener of this.eventListeners) listener(event);
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private send(message: WireMessage) {
    if (!this.process?.stdin.writable) throw new Error("Codex app-server 未连接");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private request(method: string, params: Record<string, unknown> = {}, timeoutMs = 60_000) {
    const id = this.requestId++;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 请求超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.send({ id, method, params });
    });
  }

  private notify(method: string, params: Record<string, unknown>) {
    this.send({ method, params });
  }

  resolveApproval(id: number | string, result: unknown) {
    this.send({ id, result });
  }

  async listThreads(query: ThreadListQuery | string = {}): Promise<CodexThread[]> {
    const options = typeof query === "string" ? { cwd: query } : query;
    const requestedLimit = Math.min(Math.max(options.limit ?? 200, 1), 500);
    const threads: CodexThread[] = [];
    let cursor: string | null | undefined;
    do {
      const result = (await this.request("thread/list", {
        cursor: cursor ?? null,
        limit: Math.min(100, requestedLimit - threads.length),
        sortKey: "updated_at",
        sortDirection: "desc",
        archived: options.archived ?? false,
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(options.searchTerm ? { searchTerm: options.searchTerm } : {}),
        ...(options.isPinned !== undefined ? { isPinned: options.isPinned } : {}),
      })) as { data?: CodexThread[]; nextCursor?: string | null };
      threads.push(...(result.data ?? []));
      cursor = result.nextCursor;
    } while (cursor && threads.length < requestedLimit);
    return threads;
  }

  async readThread(threadId: string): Promise<CodexThread> {
    const result = (await this.request("thread/read", {
      threadId,
      includeTurns: true,
    })) as { thread: CodexThread };
    return result.thread;
  }

  async resumeThread(threadId: string): Promise<CodexThread> {
    const result = (await this.request("thread/resume", { threadId })) as { thread: CodexThread };
    const loaded = result.thread;
    return this.readThread(loaded.id);
  }

  async startThread(input: {
    cwd: string;
    model?: string;
    modelProvider?: string;
    approvalPolicy: string;
    sandbox: string;
  }): Promise<CodexThread> {
    const result = (await this.request("thread/start", {
      cwd: input.cwd,
      model: input.model ?? null,
      modelProvider: input.modelProvider ?? null,
      approvalPolicy: input.approvalPolicy,
      sandbox: input.sandbox,
      personality: "friendly",
      ephemeral: false,
    })) as { thread: CodexThread };
    return result.thread;
  }

  startTurn(input: {
    threadId: string;
    input: AgentInput[];
    cwd?: string;
    model?: string;
    approvalPolicy?: string;
  }) {
    return this.request("turn/start", {
      threadId: input.threadId,
      input: input.input,
      ...(input.cwd ? { cwd: input.cwd } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.approvalPolicy ? { approvalPolicy: input.approvalPolicy } : {}),
    });
  }

  interrupt(threadId: string, turnId: string) {
    return this.request("turn/interrupt", { threadId, turnId });
  }

  steerTurn(threadId: string, turnId: string, input: AgentInput[]) {
    return this.request("turn/steer", { threadId, expectedTurnId: turnId, input });
  }

  async archiveThread(threadId: string) {
    await this.request("thread/archive", { threadId });
  }

  async unarchiveThread(threadId: string): Promise<CodexThread> {
    const result = (await this.request("thread/unarchive", { threadId })) as { thread: CodexThread };
    return result.thread;
  }

  async setThreadPinned(threadId: string, pinned: boolean) {
    await this.request("thread/metadata/update", { threadId, isPinned: pinned });
  }

  async setThreadName(threadId: string, name: string) {
    await this.request("thread/name/set", { threadId, name });
  }

  private async setSkillRoots(extraSkillRoots: string[]) {
    const extraRoots = [...new Set(extraSkillRoots)].sort();
    const signature = JSON.stringify(extraRoots);
    if (signature === this.skillRootsSignature) return;
    if (signature === this.skillRootsPendingSignature && this.skillRootsPending) {
      await this.skillRootsPending;
      return;
    }
    const previousPending = this.skillRootsPending;
    const update = (async () => {
      if (previousPending) await previousPending.catch(() => undefined);
      if (signature === this.skillRootsSignature) return;
      await this.request("skills/extraRoots/set", { extraRoots });
      this.skillRootsSignature = signature;
    })();
    this.skillRootsPendingSignature = signature;
    this.skillRootsPending = update;
    try {
      await update;
    } finally {
      if (this.skillRootsPending === update) {
        this.skillRootsPending = undefined;
        this.skillRootsPendingSignature = undefined;
      }
    }
  }

  async listSkills(cwd?: string, extraSkillRoots: string[] = [], forceReload = false): Promise<RuntimeSkillsSnapshot> {
    await this.setSkillRoots(extraSkillRoots);
    const result = await this.request("skills/list", {
      ...(cwd ? { cwds: [cwd] } : {}),
      forceReload,
    });
    return parseSkillsListResponse(result, extraSkillRoots);
  }

  async setSkillEnabled(
    selector: { name?: string | null; path?: string | null },
    enabled: boolean,
  ): Promise<SkillConfigWriteResult> {
    const result = await this.request("skills/config/write", {
      enabled,
      name: selector.name ?? null,
      path: selector.path ?? null,
    }) as SkillConfigWriteResult;
    return { effectiveEnabled: Boolean(result.effectiveEnabled) };
  }

  async runtimeCapabilities(cwd?: string, extraSkillRoots: string[] = []): Promise<RuntimeCapabilitySnapshot> {
    const [skillsResult, mcpResult, appsResult] = await Promise.allSettled([
      this.listSkills(cwd, extraSkillRoots, true),
      this.request("mcpServerStatus/list", { limit: 100, detail: "toolsAndAuthOnly" }),
      this.request("app/list", { limit: 100 }),
    ]);
    const rows = (result: PromiseSettledResult<unknown>) => {
      if (result.status !== "fulfilled" || !result.value || typeof result.value !== "object") return [];
      const value = result.value as Record<string, unknown>;
      const data = value.data ?? value.skills ?? value.apps ?? value.servers;
      return Array.isArray(data) ? data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
    };
    const skillSnapshot = skillsResult.status === "fulfilled" ? skillsResult.value : {
      skills: [],
      skillGroups: [],
      skillErrors: [{
        cwd: cwd ?? "",
        path: cwd ?? "",
        message: skillsResult.reason instanceof Error ? skillsResult.reason.message : "Skills 加载失败",
      }],
      loadedAt: Date.now(),
    };
    return { ...skillSnapshot, mcpServers: rows(mcpResult), apps: rows(appsResult) };
  }
}
