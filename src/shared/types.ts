export type ModelCategory = "video" | "image" | "text" | "audio" | "processing";
export type DefaultModels = Record<ModelCategory, string>;
export type ProviderModality = "llm" | "image" | "audio" | "video";
export type ProviderKind = "official" | "cloud" | "aggregator" | "compatible";
export type ProviderSupport = "native" | "configuration";
export type ProviderAuthType =
  | "bearer"
  | "x-api-key"
  | "google-api-key"
  | "anthropic"
  | "dual-key"
  | "api-key-header"
  | "multi-field";

export type ModelDefinition = {
  id: string;
  name: string;
  category: ModelCategory;
  capability: string;
  submitPath: string;
  statusPath?: string;
  protocol:
    | "async-http"
    | "chat-completions"
    | "responses"
    | "anthropic-messages"
    | "gemini-generate"
    | "native-http";
  agentCapable?: boolean;
  duration?: string;
  providerId?: string;
  providerName?: string;
  providerKind?: ProviderKind;
  nativeModelId?: string;
  support?: ProviderSupport;
};

export type CredentialFieldDefinition = {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  secret?: boolean;
  help?: string;
};

export type ProviderDefinition = {
  id: string;
  name: string;
  description: string;
  kind: ProviderKind;
  support: ProviderSupport;
  modalities: ProviderModality[];
  docsUrl: string;
  consoleUrl?: string;
  defaultBaseUrl: string;
  authType: ProviderAuthType;
  authHeader?: string;
  extraHeaders?: Record<string, string>;
  credentialFields: CredentialFieldDefinition[];
  testPath?: string;
  testMethod?: "GET" | "POST";
  modelListPath?: string;
  modelListShape?: "data" | "models";
  models: ModelDefinition[];
};

export type ProviderProfile = {
  providerId: string;
  enabled: boolean;
  baseUrl: string;
  values: Record<string, string>;
};

export type ProviderCredentialStatus = Record<string, boolean>;

export type ProviderState = ProviderDefinition & {
  profile: ProviderProfile;
  credentialStatus: ProviderCredentialStatus;
  configured: boolean;
  encryptionAvailable: boolean;
};

export type ProviderSaveInput = {
  providerId: string;
  enabled?: boolean;
  baseUrl?: string;
  values?: Record<string, string>;
  credentials?: Record<string, string>;
};

export type PluginPlacement = "quick" | "menu" | "both";

export type MenuPlugin = {
  id: string;
  name: string;
  description: string;
  icon: "blocks" | "skills" | "assets" | "automation" | "terminal" | "link";
  group: "workspace" | "creative" | "developer";
  placement: PluginPlacement;
  enabled: boolean;
  builtIn: boolean;
  command: "new-task" | "projects" | "skills" | "assets" | "automation" | "open-url" | "plugin";
  url?: string;
  shortcut?: string;
  version?: string;
  installedPath?: string;
  source?: "built-in" | "legacy" | "codex-plugin";
  skillsPath?: string;
  capabilities?: string[];
};

export type SecretStatus = {
  configured: boolean;
  encryptionAvailable: boolean;
  maskedValue?: string;
};

export type ConnectionTest = {
  ok: boolean;
  status: number;
  message: string;
  modelCount?: number;
};

export type GenerationRequest = {
  model: string;
  payload: Record<string, unknown>;
  useRoute?: boolean;
};

export type GenerationResponse = {
  success: boolean;
  status: number;
  data?: unknown;
  error?: string;
  task?: GenerationTask;
};

export type GenerationTaskStatus = "queued" | "submitting" | "running" | "completed" | "failed" | "canceled";

export type GenerationTask = {
  id: string;
  modelId: string;
  category: ModelCategory;
  providerId?: string;
  prompt: string;
  useRoute?: boolean;
  operation?: string;
  status: GenerationTaskStatus;
  remoteTaskId?: string;
  result?: unknown;
  resultUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type GenerationStreamChunk = {
  requestId: string;
  event: "connected" | "reasoning" | "delta" | "done" | "error";
  delta?: string;
  error?: string;
};

export type CodexThread = {
  id: string;
  name?: string | null;
  preview: string;
  cwd: string;
  updatedAt: number;
  status?: unknown;
  turns?: CodexTurn[];
  modelProvider?: string;
  isPinned?: boolean;
  archived?: boolean;
  gitInfo?: { branch?: string | null; sha?: string | null; originUrl?: string | null } | null;
};

export type CodexTurn = {
  id: string;
  status: string;
  items: CodexItem[];
  error?: unknown;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
};

export type CodexItem = Record<string, unknown> & { type: string; id?: string };

export type CodexStatus = {
  connected: boolean;
  command: string;
  version?: string;
  error?: string;
};

export type WorkspaceSettings = {
  baseUrl: string;
  userId: number;
  userName: string;
  codexCommand: string;
  theme: "system" | "light" | "dark";
  approvalPolicy: "untrusted" | "on-request" | "never";
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
};

export type AppSettings = WorkspaceSettings & {
  lastWorkspace?: string;
  defaultModels: DefaultModels;
};

export type CodexEvent = {
  method: string;
  params?: Record<string, unknown>;
};

export type ApprovalRequest = {
  id: number | string;
  method: string;
  params: Record<string, unknown>;
};

export type ThreadListQuery = {
  cwd?: string;
  searchTerm?: string;
  archived?: boolean;
  isPinned?: boolean;
  limit?: number;
};

export type AgentAttachment = {
  type: "localImage" | "text";
  path?: string;
  text?: string;
  name: string;
};

export type AgentInput =
  | { type: "text"; text: string; text_elements?: unknown[] }
  | { type: "localImage"; path: string }
  | { type: "image"; url: string }
  | { type: "skill"; name: string; path: string }
  | { type: "mention"; name: string; path: string };

export type SkillScope = "user" | "repo" | "system" | "admin";
export type SkillSource = SkillScope | "plugin";

export type SkillToolDependency = {
  type: string;
  value: string;
  command?: string | null;
  description?: string | null;
  transport?: string | null;
  url?: string | null;
};

export type SkillInterface = {
  displayName?: string | null;
  shortDescription?: string | null;
  iconSmall?: string | null;
  iconLarge?: string | null;
  brandColor?: string | null;
  defaultPrompt?: string | null;
};

export type SkillReference = {
  name: string;
  path: string;
  displayName?: string;
};

export type SkillMetadata = SkillReference & {
  description: string;
  shortDescription?: string | null;
  scope: SkillScope;
  source: SkillSource;
  enabled: boolean;
  interface?: SkillInterface | null;
  dependencies?: { tools: SkillToolDependency[] } | null;
};

export type SkillLoadError = {
  cwd: string;
  path: string;
  message: string;
};

export type SkillListEntry = {
  cwd: string;
  skills: SkillMetadata[];
  errors: SkillLoadError[];
};

export type RuntimeSkillsSnapshot = {
  skills: SkillMetadata[];
  skillGroups: SkillListEntry[];
  skillErrors: SkillLoadError[];
  loadedAt: number;
};

export type SkillConfigWriteResult = {
  effectiveEnabled: boolean;
};

export type RuntimeCapabilitySnapshot = RuntimeSkillsSnapshot & {
  mcpServers: Array<Record<string, unknown>>;
  apps: Array<Record<string, unknown>>;
};
