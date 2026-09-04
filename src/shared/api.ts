import type {
  AppSettings,
  AgentAttachment,
  AgentInput,
  ApprovalRequest,
  CodexEvent,
  CodexStatus,
  CodexThread,
  ConnectionTest,
  GenerationRequest,
  GenerationResponse,
  GenerationStreamChunk,
  GenerationTask,
  ModelDefinition,
  MenuPlugin,
  ProviderSaveInput,
  ProviderState,
  RuntimeCapabilitySnapshot,
  RuntimeSkillsSnapshot,
  SecretStatus,
  SkillConfigWriteResult,
  SkillReference,
  ThreadListQuery,
} from "./types";

export type HarnessApi = {
  settings: {
    get(): Promise<AppSettings>;
    set(patch: Partial<AppSettings>): Promise<AppSettings>;
  };
  secrets: {
    status(): Promise<SecretStatus>;
    save(key: string): Promise<SecretStatus>;
    remove(): Promise<SecretStatus>;
    test(): Promise<ConnectionTest>;
  };
  providers: {
    list(): Promise<ProviderState[]>;
    save(input: ProviderSaveInput): Promise<ProviderState>;
    removeCredentials(providerId: string): Promise<ProviderState>;
    test(providerId: string): Promise<ConnectionTest>;
  };
  plugins: {
    list(): Promise<MenuPlugin[]>;
    setEnabled(pluginId: string, enabled: boolean): Promise<MenuPlugin[]>;
    openFolder(): Promise<string>;
    install(): Promise<MenuPlugin[]>;
    uninstall(pluginId: string): Promise<MenuPlugin[]>;
  };
  skills: {
    list(cwd?: string, forceReload?: boolean): Promise<RuntimeSkillsSnapshot>;
    setEnabled(skill: SkillReference, enabled: boolean): Promise<SkillConfigWriteResult>;
    openFolder(path: string): Promise<void>;
  };
  models: {
    list(): Promise<ModelDefinition[]>;
    refresh(providerId?: string): Promise<ModelDefinition[]>;
  };
  generation: {
    submit(request: GenerationRequest): Promise<GenerationResponse>;
    stream(request: GenerationRequest, onChunk: (chunk: GenerationStreamChunk) => void): Promise<GenerationResponse>;
    cancelStream(): Promise<void>;
    status(model: string, taskId: string, useRoute?: boolean, operation?: string): Promise<GenerationResponse>;
    tasks(): Promise<GenerationTask[]>;
    cancelTask(taskId: string): Promise<GenerationTask>;
    openExternal(url: string): Promise<void>;
  };
  codex: {
    status(): Promise<CodexStatus>;
    start(): Promise<CodexStatus>;
    stop(): Promise<CodexStatus>;
    listThreads(query?: ThreadListQuery | string): Promise<CodexThread[]>;
    readThread(threadId: string): Promise<CodexThread>;
    resumeThread(threadId: string): Promise<CodexThread>;
    startThread(input: {
      cwd: string;
      model?: string;
      modelProvider?: string;
      approvalPolicy: string;
      sandbox: string;
    }): Promise<CodexThread>;
    startTurn(input: {
      threadId: string;
      input: AgentInput[];
      cwd?: string;
      model?: string;
      approvalPolicy?: string;
    }): Promise<{ turn: { id: string; status: string } }>;
    steerTurn(threadId: string, turnId: string, input: AgentInput[]): Promise<{ turnId: string }>;
    interrupt(threadId: string, turnId: string): Promise<unknown>;
    archiveThread(threadId: string): Promise<void>;
    unarchiveThread(threadId: string): Promise<CodexThread>;
    setThreadPinned(threadId: string, pinned: boolean): Promise<void>;
    setThreadName(threadId: string, name: string): Promise<void>;
    runtimeCapabilities(cwd?: string): Promise<RuntimeCapabilitySnapshot>;
    resolveApproval(id: number | string, result: unknown): Promise<void>;
    chooseWorkspace(): Promise<string | null>;
    chooseAttachments(): Promise<AgentAttachment[]>;
    onEvent(callback: (event: CodexEvent) => void): () => void;
    onApproval(callback: (request: ApprovalRequest) => void): () => void;
  };
};

declare global {
  interface Window {
    harness: HarnessApi;
  }
}
