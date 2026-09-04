import * as Tabs from "@radix-ui/react-tabs";
import {
  Archive,
  AppWindow,
  Box,
  Braces,
  CalendarDays,
  ChevronDown,
  CircleDot,
  Clock3,
  Code2,
  FileStack,
  Folder,
  FolderOpen,
  GitBranch,
  Layers3,
  LayoutGrid,
  Library,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  Pin,
  PinOff,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentAttachment,
  AgentInput,
  AppSettings,
  ApprovalRequest,
  CodexEvent,
  CodexStatus,
  CodexThread,
  GenerationTask,
  MenuPlugin,
  ModelDefinition,
  ProviderState,
  RuntimeCapabilitySnapshot,
  SkillMetadata,
  SkillReference,
} from "../shared/types";
import { AI_TASK_DOCS, CATEGORY_LABELS } from "../shared/modelCatalog";
import { defaultModelId, explicitlyRequestedModel, requestedGenerationCategory } from "../shared/modelSelection";
import { generationModels as selectGenerationModels, isStreamingConversationModel, providerCoverage } from "../shared/providerCatalog";
import { ApprovalDialog } from "./components/ApprovalDialog";
import { BrandMark } from "./components/BrandMark";
import { FocusPanel } from "./components/FocusPanel";
import { ModelPicker } from "./components/ModelPicker";
import { PluginPanel } from "./components/PluginPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { SkillPicker } from "./components/SkillPicker";
import { ThreadContent } from "./components/ThreadContent";
import { buildAgentInput } from "./agentInput";
import { applyCodexEvent, failOptimisticTurn, optimisticTurn } from "./threadEvents";

const defaultSettings: AppSettings = {
  baseUrl: "https://ai-mcp.wuread.cn",
  userId: 1,
  userName: "AIYOU User",
  codexCommand: "codex",
  theme: "system",
  approvalPolicy: "on-request",
  sandbox: "workspace-write",
  defaultModels: {
    text: "codex",
    image: "seedream-4.5",
    audio: "seed-tts-2.0",
    video: "seedance-2.5",
    processing: "vod-enhance",
  },
};

const coverage = providerCoverage();

function displayName(thread: CodexThread) {
  return thread.name?.trim() || thread.preview?.trim() || "未命名任务";
}

function shortPath(path?: string) {
  if (!path) return "选择工作区";
  const parts = path.split("/").filter(Boolean);
  return parts.at(-1) ?? path;
}

function timeAgo(timestamp: number) {
  const seconds = Math.max(0, Date.now() / 1000 - timestamp);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时`;
  return `${Math.floor(seconds / 86400)} 天`;
}

function eventLabel(event: CodexEvent) {
  const labels: Record<string, string> = {
    "turn/started": "Agent 开始处理",
    "turn/completed": "本轮处理完成",
    "item/started": "工具项目已开始",
    "item/completed": "工具项目已完成",
    "turn/diff/updated": "文件差异已更新",
    "turn/plan/updated": "执行计划已更新",
    "thread/tokenUsage/updated": "上下文用量已更新",
    "aiyou/approvalRequested": "等待用户审批",
    "aiyou/approvalResolved": "审批已处理",
  };
  return labels[event.method] ?? event.method;
}

function threadState(thread: CodexThread) {
  const raw = typeof thread.status === "string" ? thread.status : JSON.stringify(thread.status ?? "");
  if (/interrupt|cancel|aborted|中断/i.test(raw)) return "interrupted";
  if (/progress|running|started/i.test(raw)) return "running";
  return "recent";
}

function eventThreadId(event: CodexEvent) {
  return typeof event.params?.threadId === "string" ? event.params.threadId : undefined;
}

function eventTurnId(event: CodexEvent) {
  if (typeof event.params?.turnId === "string") return event.params.turnId;
  const turn = event.params?.turn;
  return turn && typeof turn === "object" && typeof (turn as Record<string, unknown>).id === "string"
    ? String((turn as Record<string, unknown>).id)
    : undefined;
}

function isRunningTurn(status?: string) {
  return Boolean(status && /in.?progress|running|started/i.test(status));
}

function userTextFromTurn(thread: CodexThread, turnId: string) {
  const turn = thread.turns?.find((item) => item.id === turnId);
  const message = turn?.items.find((item) => item.type === "userMessage");
  if (!Array.isArray(message?.content)) return "";
  return message.content.map((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return value.type === "text" ? String(value.text ?? "") : "";
  }).filter(Boolean).join("\n");
}

function userSkillsFromTurn(thread: CodexThread, turnId: string): SkillReference[] {
  const turn = thread.turns?.find((item) => item.id === turnId);
  const message = turn?.items.find((item) => item.type === "userMessage");
  if (!Array.isArray(message?.content)) return [];
  return message.content.flatMap((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return value.type === "skill" && typeof value.name === "string" && typeof value.path === "string"
      ? [{ name: value.name, path: value.path, displayName: typeof value.displayName === "string" ? value.displayName : value.name }]
      : [];
  });
}

function userAttachmentsFromTurn(thread: CodexThread, turnId: string): AgentAttachment[] {
  const turn = thread.turns?.find((item) => item.id === turnId);
  const message = turn?.items.find((item) => item.type === "userMessage");
  if (!Array.isArray(message?.content)) return [];
  return message.content.flatMap((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    if (value.type !== "localImage" || typeof value.path !== "string") return [];
    return [{ type: "localImage" as const, path: value.path, name: value.path.split(/[\\/]/).at(-1) ?? "本地图片" }];
  });
}

const emptyCapabilities: RuntimeCapabilitySnapshot = { skills: [], skillGroups: [], skillErrors: [], mcpServers: [], apps: [], loadedAt: 0 };

const captureSkills: SkillMetadata[] = [
  { name: "code-review", displayName: "代码审查", description: "检查变更中的正确性、回归风险与验证边界。", shortDescription: "审查代码与风险", path: "/AIYOU/Demo/.agents/skills/code-review/SKILL.md", scope: "repo", source: "repo", enabled: true, interface: { displayName: "代码审查", shortDescription: "审查代码与风险", iconSmall: null, iconLarge: null, brandColor: "#ef6f61", defaultPrompt: "审查当前工作区的最近变更" }, dependencies: { tools: [{ type: "mcp", value: "git", command: null, description: null, transport: null, url: null }] } },
  { name: "document-workflow", displayName: "文档工作流", description: "生成、排版并验证项目文档。", shortDescription: "创建并验证文档", path: "/Users/AIYOU/.agents/skills/document-workflow/SKILL.md", scope: "user", source: "user", enabled: true, interface: null, dependencies: null },
  { name: "imagegen", displayName: "图片生成", description: "创建和编辑产品所需的图片资产。", shortDescription: "生成与编辑图片", path: "/AIYOU/plugins/media/skills/imagegen/SKILL.md", scope: "user", source: "plugin", enabled: true, interface: { displayName: "图片生成", shortDescription: "生成与编辑图片", iconSmall: null, iconLarge: null, brandColor: "#ff8d72", defaultPrompt: null }, dependencies: { tools: [{ type: "mcp", value: "image_gen", command: null, description: null, transport: null, url: null }] } },
  { name: "legacy-export", displayName: "旧版导出", description: "旧版项目导出流程。", shortDescription: "旧版导出", path: "/Users/AIYOU/.agents/skills/legacy-export/SKILL.md", scope: "user", source: "user", enabled: false, interface: null, dependencies: null },
];
const captureSkillErrors = [{ cwd: "/AIYOU/Demo", path: "/AIYOU/Demo/.agents/skills/broken/SKILL.md", message: "frontmatter 缺少 name，未载入该 Skill" }];
const captureSkillsSnapshot: RuntimeCapabilitySnapshot = {
  skills: captureSkills,
  skillGroups: [{ cwd: "/AIYOU/Demo", skills: captureSkills, errors: captureSkillErrors }],
  skillErrors: captureSkillErrors,
  mcpServers: [{ name: "workspace", status: "connected" }],
  apps: [],
  loadedAt: Date.now(),
};

const pluginIcons: Record<MenuPlugin["icon"], typeof Plug> = {
  blocks: LayoutGrid,
  skills: Library,
  assets: AppWindow,
  automation: CalendarDays,
  terminal: Code2,
  link: Plug,
};

export function App() {
  const captureView = new URLSearchParams(window.location.search).get("capture");
  const [settings, setSettings] = useState(defaultSettings);
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [plugins, setPlugins] = useState<MenuPlugin[]>([]);
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [threads, setThreads] = useState<CodexThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<CodexThread | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("codex");
  const [selectedGenerationModelId, setSelectedGenerationModelId] = useState("");
  const [chatModelManuallySelected, setChatModelManuallySelected] = useState(false);
  const [generationModelManuallySelected, setGenerationModelManuallySelected] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [threadFilter, setThreadFilter] = useState<"pinned" | "projects" | "recent" | "interrupted" | "archived">("projects");
  const [projectFilter, setProjectFilter] = useState("all");
  const [projectFiltersOpen, setProjectFiltersOpen] = useState(true);
  const [pluginMenuOpen, setPluginMenuOpen] = useState(false);
  const [activePlugin, setActivePlugin] = useState<MenuPlugin | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(captureView === "settings" || captureView === "defaults");
  const [focusOpen, setFocusOpen] = useState(captureView === "models");
  const [rightOpen, setRightOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [startingTurn, setStartingTurn] = useState(false);
  const [activeRuns, setActiveRuns] = useState<Record<string, string>>({});
  const activeRunsRef = useRef<Record<string, string>>({});
  const [codexStatus, setCodexStatus] = useState<CodexStatus>({ connected: false, command: "codex" });
  const [events, setEvents] = useState<CodexEvent[]>([]);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [notice, setNotice] = useState("");
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<SkillReference[]>([]);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilitySnapshot>(emptyCapabilities);
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);

  const conversationModels = useMemo(() => models.filter(isStreamingConversationModel), [models]);
  const generationModels = useMemo(() => selectGenerationModels(models), [models]);
  const selectedModel = models.find((model) => model.id === selectedModelId);
  const selectedProvider = providers.find((provider) => provider.id === selectedModel?.providerId);
  const selectedGenerationModel = generationModels.find((model) => model.id === selectedGenerationModelId);
  const selectedGenerationProvider = providers.find((provider) => provider.id === selectedGenerationModel?.providerId);
  const workspace = settings.lastWorkspace;
  const activeTurnId = selectedThread ? activeRuns[selectedThread.id] : undefined;
  const sending = startingTurn || Boolean(activeTurnId);

  const refreshSkills = useCallback(async (forceReload = false) => {
    const snapshot = await window.harness.skills.list(workspace, forceReload);
    setCapabilities((current) => ({ ...current, ...snapshot }));
    setSelectedSkills((current) => current.filter((selected) => snapshot.skills.some((skill) => skill.path === selected.path && skill.enabled)));
    return snapshot;
  }, [workspace]);

  const rememberRun = useCallback((threadId: string, turnId?: string) => {
    const next = { ...activeRunsRef.current };
    if (turnId) next[threadId] = turnId;
    else delete next[threadId];
    activeRunsRef.current = next;
    setActiveRuns(next);
  }, []);

  const loadThreads = useCallback(async (cwd?: string) => {
    try {
      const [active, archived, status] = await Promise.all([
        window.harness.codex.listThreads({ cwd, archived: false, limit: 300 }),
        window.harness.codex.listThreads({ cwd, archived: true, limit: 200 }),
        window.harness.codex.status(),
      ]);
      setThreads([
        ...active.map((thread) => ({ ...thread, archived: false })),
        ...archived.map((thread) => ({ ...thread, archived: true })),
      ]);
      setCodexStatus(status);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法读取 Codex 任务");
      setCodexStatus(await window.harness.codex.status());
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const [nextSettings, nextProviders, nextPlugins, nextModels, nextCodex, nextTasks] = await Promise.all([
          window.harness.settings.get(),
          window.harness.providers.list(),
          window.harness.plugins.list(),
          window.harness.models.list(),
          window.harness.codex.status(),
          window.harness.generation.tasks(),
        ]);
        if (disposed) return;
        const displaySettings = captureView ? { ...defaultSettings, lastWorkspace: "/AIYOU/Demo" } : nextSettings;
        const displayProviders = captureView ? nextProviders.map((provider) => ({
          ...provider,
          profile: { ...provider.profile, baseUrl: provider.defaultBaseUrl, values: {} },
          credentialStatus: Object.fromEntries(provider.credentialFields.map((field) => [field.id, false])),
          configured: provider.credentialFields.filter((field) => field.required !== false).length === 0,
        })) : nextProviders;
        const displayPlugins = captureView ? nextPlugins.filter((plugin) => plugin.builtIn) : nextPlugins;
        setSettings(displaySettings);
        setProviders(displayProviders);
        setPlugins(displayPlugins);
        setModels(nextModels);
        setCodexStatus(captureView ? { connected: true, command: "bundled codex" } : nextCodex);
        setGenerationTasks(captureView ? [] : nextTasks);
        if (captureView === "skills") setCapabilities(captureSkillsSnapshot);
        setSelectedModelId(defaultModelId(displaySettings, nextModels, "text"));
        setSelectedGenerationModelId(defaultModelId(displaySettings, nextModels, "image"));
        if (captureView === "models" && nextModels[0]) {
          const firstGeneration = selectGenerationModels(nextModels)[0];
          if (firstGeneration) setSelectedGenerationModelId(firstGeneration.id);
          setFocusOpen(true);
        }
        if (captureView === "streaming") {
          const chatModel = nextModels.find((model) => model.providerId === "custom-openai" && isStreamingConversationModel(model))
            ?? nextModels.find(isStreamingConversationModel);
          if (chatModel) setSelectedModelId(chatModel.id);
          const captureThread: CodexThread = {
            id: "thread_capture_aiyou",
            name: "统一 Agent Runtime 演示",
            preview: "请把这段产品需求整理成三个可执行步骤。",
            cwd: "/AIYOU/Demo",
            updatedAt: Date.now() / 1000,
            modelProvider: "aiyou",
            turns: [{
              id: "turn_capture_streaming",
              status: "inProgress",
              items: [
                { id: "capture-user", type: "userMessage", content: [{ type: "text", text: "请把这段产品需求整理成三个可执行步骤。" }] },
                { id: "capture-reasoning", type: "reasoning", summary: ["先识别需求中的目标、约束和验收边界，再按依赖关系组织步骤。"] },
                { id: "capture-agent", type: "agentMessage", text: "我会先明确目标与边界，再拆分实现任务，最后补充验收标准" },
              ],
            }],
          };
          setThreads([captureThread]);
          setSelectedThread(captureThread);
          rememberRun(captureThread.id, "turn_capture_streaming");
        }
        if (captureView && captureView !== "streaming") {
          const captureThread: CodexThread = {
            id: "thread_capture_completed",
            name: "完善 AIYOU Agent Runtime",
            preview: "统一第三方模型的 Thread、Turn、工具与审批时间线",
            cwd: "/AIYOU/Demo",
            updatedAt: Date.now() / 1000,
            isPinned: true,
            turns: [{ id: "turn_capture_completed", status: "completed", items: [
              { id: "capture-main-user", type: "userMessage", content: [{ type: "text", text: "检查统一运行时并完成验证。" }] },
              { id: "capture-main-command", type: "commandExecution", command: "npm run verify", status: "completed", aggregatedOutput: "32 tests passed\nProduction build passed", exitCode: 0 },
              { id: "capture-main-agent", type: "agentMessage", text: "统一 Agent Runtime 已通过协议、状态与界面验证。" },
            ] }],
          };
          setThreads([captureThread]);
          if (captureView === "main") setSelectedThread(captureThread);
        }
        if (captureView === "plugins") {
          setActivePlugin(displayPlugins.find((plugin) => plugin.command === "assets") ?? displayPlugins[0] ?? null);
        }
        if (captureView === "skills") {
          setActivePlugin(displayPlugins.find((plugin) => plugin.command === "skills") ?? null);
        }
        if (!captureView) {
          void loadThreads(nextSettings.lastWorkspace);
          void window.harness.codex.runtimeCapabilities(nextSettings.lastWorkspace).then((snapshot) => {
            if (!disposed) setCapabilities(snapshot);
          }).catch(() => undefined);
        }
      } catch (error) {
        if (!disposed) setNotice(error instanceof Error ? error.message : "AIYOU 初始化失败");
      }
    })();
    return () => { disposed = true; };
  }, [loadThreads]);

  useEffect(() => {
    const offEvent = window.harness.codex.onEvent((event) => {
      setEvents((current) => [...current.slice(-119), event]);
      setSelectedThread((current) => applyCodexEvent(current, event));
      const threadId = eventThreadId(event);
      const turnId = eventTurnId(event);
      if (event.method === "turn/started" && threadId && turnId) rememberRun(threadId, turnId);
      if (event.method === "turn/completed") {
        if (threadId) rememberRun(threadId);
        if (threadId) {
          void window.harness.codex.readThread(threadId).then((thread) => {
            setSelectedThread((current) => current?.id === threadId ? thread : current);
          }).catch(() => undefined);
        }
        void loadThreads(workspace);
        setNotice((current) => current.startsWith("正在停止") ? "当前 Turn 已停止" : current);
      }
      if (event.method === "error" || event.method === "aiyou/protocolError") {
        const error = event.params?.error;
        const message = error && typeof error === "object" ? (error as Record<string, unknown>).message : event.params?.message;
        if (message) setNotice(String(message));
      }
      if (event.method === "skills/changed") {
        void refreshSkills(true).catch((error) => setNotice(error instanceof Error ? error.message : "Skills 重新加载失败"));
      }
    });
    const offApproval = window.harness.codex.onApproval((request) => {
      setApproval(request);
      const event: CodexEvent = {
        method: "aiyou/approvalRequested",
        params: {
          ...request.params,
          requestId: request.id,
          approvalMethod: request.method,
          details: request.params,
        },
      };
      setEvents((current) => [...current.slice(-119), event]);
      setSelectedThread((current) => applyCodexEvent(current, event));
    });
    return () => {
      offEvent();
      offApproval();
    };
  }, [loadThreads, refreshSkills, rememberRun, workspace]);

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(".conversation-scroll");
    if (target) target.scrollTop = target.scrollHeight;
  }, [events, selectedThread]);

  useEffect(() => {
    if (captureView || !plugins.length) return;
    void window.harness.codex.runtimeCapabilities(workspace).then(setCapabilities).catch(() => undefined);
  }, [captureView, plugins, workspace]);

  useEffect(() => {
    const pollable = generationTasks.filter((task) => task.status === "running" && task.remoteTaskId);
    if (!pollable.length) return;
    let disposed = false;
    const poll = async () => {
      const results = await Promise.allSettled(pollable.map((task) => window.harness.generation.status(
        task.modelId,
        task.remoteTaskId!,
        task.useRoute,
        task.operation,
      )));
      if (disposed) return;
      const updates = results.flatMap((result) => result.status === "fulfilled" && result.value.task ? [result.value.task] : []);
      if (updates.length) setGenerationTasks((current) => current.map((task) => updates.find((item) => item.id === task.id) ?? task));
    };
    const timer = window.setInterval(() => void poll(), 12_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [generationTasks]);

  const visibleThreads = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();
    return threads
      .filter((thread) => !query || `${displayName(thread)} ${thread.preview} ${thread.cwd}`.toLowerCase().includes(query))
      .filter((thread) => projectFilter === "all" || thread.cwd === projectFilter)
      .filter((thread) => {
        if (threadFilter === "archived") return Boolean(thread.archived);
        if (thread.archived) return false;
        if (threadFilter === "interrupted") return threadState(thread) === "interrupted";
        if (threadFilter === "pinned") return Boolean(thread.isPinned);
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projectFilter, threadFilter, threadSearch, threads]);

  const projectPaths = useMemo(() => Array.from(new Set(threads.map((thread) => thread.cwd).filter(Boolean))), [threads]);
  const quickPlugins = plugins.filter((plugin) => plugin.enabled && (plugin.placement === "quick" || plugin.placement === "both"));
  const menuPlugins = plugins.filter((plugin) => plugin.enabled && (plugin.placement === "menu" || plugin.placement === "both"));

  async function chooseWorkspace() {
    const path = await window.harness.codex.chooseWorkspace();
    if (!path) return null;
    const next = await window.harness.settings.set({ lastWorkspace: path });
    setSettings(next);
    setSelectedThread(null);
    setEvents([]);
    setSelectedSkills([]);
    setAttachments([]);
    await loadThreads(path);
    void window.harness.codex.runtimeCapabilities(path).then(setCapabilities).catch(() => undefined);
    return path;
  }

  async function openThread(thread: CodexThread) {
    setEvents([]);
    setNotice("");
    try {
      const loaded = thread.archived
        ? await window.harness.codex.readThread(thread.id)
        : await window.harness.codex.resumeThread(thread.id);
      setSelectedThread({ ...loaded, archived: thread.archived });
      const running = loaded.turns?.slice().reverse().find((turn) => isRunningTurn(turn.status));
      if (running) rememberRun(loaded.id, running.id);
    } catch (error) {
      setSelectedThread(thread);
      setNotice(error instanceof Error ? error.message : "无法恢复任务");
    }
  }

  async function dispatchTask(text: string, selectedAttachments: AgentAttachment[], taskSkills: SkillReference[] = selectedSkills) {
    if ((!text.trim() && selectedAttachments.length === 0 && taskSkills.length === 0) || startingTurn) return;
    const staleSkills = taskSkills.filter((selected) => !capabilities.skills.some((skill) => skill.path === selected.path && skill.enabled));
    if (staleSkills.length) {
      setNotice(`Skill ${staleSkills.map((skill) => skill.displayName ?? skill.name).join("、")} 已停用或不在当前工作区，请重新选择`);
      void refreshSkills(true).catch(() => undefined);
      return;
    }
    const cleanText = text.trim();
    const requestedGenerationModel = explicitlyRequestedModel(cleanText, generationModels);
    const generationCategory = requestedGenerationModel?.category === "text"
      ? undefined
      : requestedGenerationModel?.category ?? requestedGenerationCategory(cleanText);
    if (generationCategory) {
      const routeId = requestedGenerationModel?.id
        ?? (generationModelManuallySelected && selectedGenerationModel?.category === generationCategory
          ? selectedGenerationModel.id
          : defaultModelId(settings, models, generationCategory));
      if (routeId) setSelectedGenerationModelId(routeId);
      setFocusOpen(true);
      setNotice(`已按${CATEGORY_LABELS[generationCategory]}任务路由到${requestedGenerationModel ? `指定模型 ${requestedGenerationModel.name}` : "该类型默认模型"}，请确认参数后提交。`);
      return;
    }
    const requestedModel = explicitlyRequestedModel(cleanText, conversationModels);
    const effectiveModelId = requestedModel?.id ?? selectedModelId;
    const effectiveModel = conversationModels.find((item) => item.id === effectiveModelId);
    const externalProvider = effectiveModelId === "codex"
      ? undefined
      : providers.find((item) => item.id === effectiveModel?.providerId);
    if (effectiveModelId !== "codex" && !effectiveModel) {
      setNotice("当前模型不能进入 Agent Runtime，请选择支持流式输出的 LLM");
      return;
    }
    if (effectiveModelId !== "codex" && !externalProvider?.configured) {
      setNotice(`请先在设置中配置 ${externalProvider?.name ?? effectiveModel?.providerName ?? "对应平台"} 凭证`);
      setSettingsOpen(true);
      return;
    }
    if (requestedModel) setSelectedModelId(requestedModel.id);
    setNotice("");
    setStartingTurn(true);
    const originalPrompt = prompt;
    const originalAttachments = attachments;
    const originalSkills = selectedSkills;
    let runThreadId: string | undefined;
    let pendingTurnId: string | undefined;
    try {
      const cwd = workspace ?? await chooseWorkspace();
      if (!cwd) return;
      const desiredProvider = effectiveModelId === "codex" ? "codex" : "aiyou";
      let thread = selectedThread;
      const currentProvider = thread?.modelProvider === "aiyou" ? "aiyou" : "codex";
      const startFreshThread = async () => {
        const created = await window.harness.codex.startThread({
          cwd,
          ...(effectiveModelId !== "codex" ? { model: effectiveModelId, modelProvider: "aiyou" } : {}),
          approvalPolicy: settings.approvalPolicy,
          sandbox: settings.sandbox,
        });
        return { ...created, modelProvider: desiredProvider === "aiyou" ? "aiyou" : created.modelProvider };
      };
      if (!thread || currentProvider !== desiredProvider || thread.cwd !== cwd) {
        thread = await startFreshThread();
      } else if (thread.archived) {
        thread = { ...await window.harness.codex.unarchiveThread(thread.id), archived: false };
      } else {
        try {
          thread = await window.harness.codex.resumeThread(thread.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!/thread.*not found|not found.*thread/i.test(message)) throw error;
          thread = await startFreshThread();
          setNotice("原任务索引已失效，AIYOU 已为本次输入创建新的持久化任务。 ");
        }
      }
      runThreadId = thread.id;
      setSelectedThread(thread);
      setPrompt("");
      setAttachments([]);
      setSelectedSkills([]);
      const input = buildAgentInput(cleanText, selectedAttachments, taskSkills);
      const temporaryTurnId = `pending-${crypto.randomUUID()}`;
      pendingTurnId = temporaryTurnId;
      setSelectedThread((current) => current?.id === thread!.id
        ? optimisticTurn(current, temporaryTurnId, cleanText, selectedAttachments.flatMap((item) => item.type === "localImage" && item.path ? [item.path] : []), taskSkills)
        : current);
      rememberRun(thread.id, temporaryTurnId);
      let result: { turn: { id: string; status: string } };
      try {
        result = await window.harness.codex.startTurn({
          threadId: thread.id,
          input,
          cwd,
          ...(effectiveModelId !== "codex" ? { model: effectiveModelId } : {}),
          approvalPolicy: settings.approvalPolicy,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!/thread.*not found|not found.*thread/i.test(message)) throw error;
        rememberRun(thread.id);
        thread = await startFreshThread();
        runThreadId = thread.id;
        setSelectedThread(optimisticTurn(thread, temporaryTurnId, cleanText, [], taskSkills));
        result = await window.harness.codex.startTurn({
          threadId: thread.id,
          input,
          cwd,
          ...(effectiveModelId !== "codex" ? { model: effectiveModelId } : {}),
          approvalPolicy: settings.approvalPolicy,
        });
      }
      rememberRun(thread.id, result.turn.id);
      setSelectedThread((current) => {
        if (current?.id !== thread!.id || temporaryTurnId === result.turn.id) return current;
        const turns = current.turns ?? [];
        const hasAuthoritative = turns.some((turn) => turn.id === result.turn.id);
        return {
          ...current,
          turns: hasAuthoritative
            ? turns.filter((turn) => turn.id !== temporaryTurnId)
            : turns.map((turn) => turn.id === temporaryTurnId ? { ...turn, id: result.turn.id, status: result.turn.status } : turn),
        };
      });
      void loadThreads(cwd);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发送失败";
      setNotice(message);
      if (runThreadId) rememberRun(runThreadId);
      if (runThreadId && pendingTurnId) {
        setSelectedThread((current) => {
          if (!current || current.id !== runThreadId) return current;
          return failOptimisticTurn(current, pendingTurnId!, message);
        });
      }
      setPrompt((current) => current || originalPrompt || cleanText);
      setAttachments((current) => current.length ? current : originalAttachments);
      setSelectedSkills((current) => current.length ? current : originalSkills);
    } finally {
      setStartingTurn(false);
    }
  }

  async function send() {
    await dispatchTask(prompt, attachments, selectedSkills);
  }

  async function resolveApproval(accepted: boolean) {
    if (!approval) return;
    const legacy = approval.method === "applyPatchApproval" || approval.method === "execCommandApproval";
    await window.harness.codex.resolveApproval(approval.id, {
      decision: legacy ? (accepted ? "approved" : "denied") : (accepted ? "accept" : "decline"),
    });
    const event: CodexEvent = {
      method: "aiyou/approvalResolved",
      params: {
        ...approval.params,
        requestId: approval.id,
        approvalMethod: approval.method,
        decision: accepted ? "accepted" : "declined",
      },
    };
    setEvents((current) => [...current.slice(-119), event]);
    setSelectedThread((current) => applyCodexEvent(current, event));
    setApproval(null);
  }

  function retryTurn(turnId: string) {
    if (!selectedThread || sending) return;
    const text = userTextFromTurn(selectedThread, turnId);
    const skills = userSkillsFromTurn(selectedThread, turnId);
    const retryAttachments = userAttachmentsFromTurn(selectedThread, turnId);
    if (!text && !skills.length && !retryAttachments.length) {
      setNotice("该轮没有可重试的用户输入");
      return;
    }
    void dispatchTask(text, retryAttachments, skills);
  }

  async function stopCurrentRun() {
    if (!selectedThread || !activeTurnId) return;
    setNotice("正在停止当前 Turn…");
    try {
      await window.harness.codex.interrupt(selectedThread.id, activeTurnId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "停止失败");
    }
  }

  async function chooseAttachments() {
    const selected = await window.harness.codex.chooseAttachments();
    if (selected.length) setAttachments((current) => [...current, ...selected]);
  }

  function useSkill(skill: SkillReference) {
    setSelectedSkills((current) => current.some((item) => item.path === skill.path) ? current : [...current, skill]);
    setNotice(`${skill.displayName ?? skill.name} 已加入当前任务`);
  }

  function openSkillLibrary() {
    const plugin = plugins.find((item) => item.command === "skills" && item.enabled);
    if (plugin) setActivePlugin(plugin);
    else setNotice("Skills 模块当前未启用");
  }

  async function setSkillEnabled(skill: SkillMetadata, enabled: boolean) {
    try {
      const result = await window.harness.skills.setEnabled({ name: skill.name, path: skill.path, displayName: skill.displayName }, enabled);
      await refreshSkills(true);
      setNotice(`${skill.displayName ?? skill.name} 已${result.effectiveEnabled ? "启用" : "停用"}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Skill 状态更新失败");
      throw error;
    }
  }

  async function openSkillFolder(path: string) {
    try {
      await window.harness.skills.openFolder(path);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法打开 Skill 位置");
    }
  }

  async function toggleSelectedArchive() {
    if (!selectedThread) return;
    if (activeTurnId) {
      setNotice("请先停止当前 Turn，再归档任务");
      return;
    }
    try {
      if (selectedThread.archived) {
        const next = await window.harness.codex.unarchiveThread(selectedThread.id);
        setSelectedThread({ ...next, archived: false });
        setNotice("任务已移出归档");
      } else {
        await window.harness.codex.archiveThread(selectedThread.id);
        setSelectedThread(null);
        setNotice("任务已归档，可在左侧“归档”中恢复");
      }
      await loadThreads(workspace);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "归档操作失败");
    }
  }

  async function toggleSelectedPin() {
    if (!selectedThread) return;
    try {
      const pinned = !selectedThread.isPinned;
      await window.harness.codex.setThreadPinned(selectedThread.id, pinned);
      setSelectedThread({ ...selectedThread, isPinned: pinned });
      setThreads((current) => current.map((thread) => thread.id === selectedThread.id ? { ...thread, isPinned: pinned } : thread));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "置顶操作失败");
    }
  }

  function selectModel(id: string) {
    setSelectedModelId(id);
    setChatModelManuallySelected(true);
  }

  function selectGenerationModel(id: string) {
    setSelectedGenerationModelId(id);
    setGenerationModelManuallySelected(true);
  }

  function openGeneration() {
    if (!selectedGenerationModelId) {
      setSelectedGenerationModelId(defaultModelId(settings, models, "image"));
    }
    setFocusOpen(true);
  }

  function saveAppSettings(next: AppSettings) {
    setSettings(next);
    if (!chatModelManuallySelected) setSelectedModelId(defaultModelId(next, models, "text"));
    if (!generationModelManuallySelected) {
      const category = selectedGenerationModel?.category ?? "image";
      setSelectedGenerationModelId(defaultModelId(next, models, category));
    }
  }

  function newTask() {
    setSelectedThread(null);
    setPrompt("");
    setAttachments([]);
    setSelectedSkills([]);
    setEvents([]);
    setNotice("");
  }

  function runPlugin(plugin: MenuPlugin) {
    setPluginMenuOpen(false);
    if (plugin.command === "new-task") return newTask();
    if (plugin.command === "projects") {
      setThreadFilter("projects");
      setProjectFiltersOpen(true);
      return;
    }
    if (plugin.command === "open-url" && plugin.url) {
      void window.harness.generation.openExternal(plugin.url);
      return;
    }
    setActivePlugin(plugin);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className={sidebarOpen ? "sidebar" : "sidebar collapsed"} aria-label="AIYOU 导航">
        <div className="sidebar-drag" />
        <div className="brand-row">
          <div className="brand-lockup"><BrandMark /><strong>AIYOU</strong><ChevronDown size={13} /></div>
          <button className="icon-button" aria-label="收起侧栏" onClick={() => setSidebarOpen(false)}><Menu size={16} /></button>
        </div>
        <div className="quick-modules" aria-label="快捷模块">
          <button className="quick-module primary" onClick={newTask}><span><MessageSquarePlus size={18} /></span><strong>新任务</strong><small>⌘ N</small></button>
          {quickPlugins.slice(0, 3).map((plugin) => {
            const Icon = pluginIcons[plugin.icon];
            return <button className="quick-module" key={plugin.id} onClick={() => runPlugin(plugin)}><span><Icon size={18} /></span><strong>{plugin.name}</strong>{plugin.shortcut && <small>{plugin.shortcut}</small>}</button>;
          })}
        </div>

        <div className="thread-filter-tabs" role="tablist" aria-label="任务筛选">
          {([['pinned', '置顶'], ['projects', '项目'], ['recent', '最近'], ['interrupted', '中断'], ['archived', '归档']] as const).map(([value, label]) => <button role="tab" aria-selected={threadFilter === value} className={threadFilter === value ? "active" : ""} key={value} onClick={() => setThreadFilter(value)}>{label}</button>)}
          <button className="filter-more" aria-label="更多插件" onClick={() => setPluginMenuOpen((value) => !value)}><MoreHorizontal size={16} /></button>
          <button className="filter-add" aria-label="新任务" onClick={newTask}><Plus size={17} /></button>
        </div>

        <div className="project-filter-panel">
          <div className="sidebar-search"><Search size={15} /><input value={threadSearch} onChange={(event) => setThreadSearch(event.target.value)} placeholder="搜索文件夹、项目或任务" aria-label="搜索文件夹、项目或任务" /><button aria-label="选择工作区" onClick={chooseWorkspace}><FolderOpen size={15} /></button></div>
          {projectFiltersOpen && <div className="project-chip-grid" aria-label="项目筛选">
            <button className={projectFilter === "all" ? "active" : ""} onClick={() => setProjectFilter("all")}>全部</button>
            {projectPaths.slice(0, 11).map((path) => <button title={path} className={projectFilter === path ? "active" : ""} key={path} onClick={() => setProjectFilter(path)}>{shortPath(path)}</button>)}
          </div>}
          <button className="project-filter-toggle" onClick={() => setProjectFiltersOpen((value) => !value)}><span>{projectPaths.length} 个文件夹 · 最近使用优先</span><span>{projectFiltersOpen ? "收起" : "展开"} <ChevronDown size={12} /></span></button>
        </div>

        <div className="thread-card-list" aria-live="polite">
          {visibleThreads.slice(0, 40).map((thread) => (
            <button key={thread.id} className={selectedThread?.id === thread.id ? "thread-card active" : "thread-card"} onClick={() => openThread(thread)}>
              <span className={`thread-card__orb ${threadState(thread)}`}><i /></span>
              <strong>{thread.isPinned && <Pin size={12} fill="currentColor" />} {displayName(thread)}</strong>
              <small>{timeAgo(thread.updatedAt)}前 · {shortPath(thread.cwd)}</small>
              <p>{thread.preview || "打开任务查看对话与执行记录"}</p>
              <span className="thread-card__tags"><em>{shortPath(thread.cwd)}</em><em>{thread.archived ? "已归档" : threadState(thread) === "interrupted" ? "已中断" : threadState(thread) === "running" ? "执行中" : "最近任务"}</em></span>
            </button>
          ))}
          {visibleThreads.length === 0 && <div className="thread-list-empty">当前筛选下没有任务</div>}
        </div>
        <div className="sidebar-footer">
          <div className="plugin-menu-anchor">
            <button onClick={() => setPluginMenuOpen((value) => !value)}><Plug size={15} /><span>插件菜单</span><em>{menuPlugins.length}</em></button>
            {pluginMenuOpen && <div className="plugin-popover" role="menu">
              <div><strong>已启用插件</strong><button onClick={() => setSettingsOpen(true)} aria-label="管理插件"><Settings size={13} /></button></div>
              {menuPlugins.map((plugin) => {
                const Icon = pluginIcons[plugin.icon];
                return <button role="menuitem" key={plugin.id} onClick={() => runPlugin(plugin)}><Icon size={15} /><span><strong>{plugin.name}</strong><small>{plugin.description}</small></span>{plugin.shortcut && <kbd>{plugin.shortcut}</kbd>}</button>;
              })}
            </div>}
          </div>
          <button onClick={() => setSettingsOpen(true)}><Settings size={15} /><span>设置</span>{providers.every((item) => !item.configured) && <i className="attention-dot" />}</button>
          <div className="connection-row"><span className={codexStatus.connected ? "status-dot ok" : "status-dot"} />Codex {codexStatus.connected ? "已连接" : "未连接"}<small>{providers.filter((item) => item.configured).length} 个平台</small></div>
        </div>
      </aside>

      {!sidebarOpen && <button className="sidebar-reopen" onClick={() => setSidebarOpen(true)} aria-label="展开侧栏"><Menu size={17} /></button>}

      <main id="main-content" className="workspace-main">
        <header className="workspace-toolbar">
          <button className="workspace-selector" onClick={chooseWorkspace}><FolderOpen size={15} /><span>{shortPath(workspace)}</span><ChevronDown size={13} /></button>
          <div className="toolbar-meta"><GitBranch size={13} /><span>{selectedThread?.gitInfo?.branch ?? "未检测分支"}</span></div>
          <div className="toolbar-spacer" />
          <button className="toolbar-button" onClick={toggleSelectedPin} disabled={!selectedThread}>{selectedThread?.isPinned ? <PinOff size={14} /> : <Pin size={14} />}{selectedThread?.isPinned ? "取消置顶" : "置顶"}</button>
          <button className="toolbar-button" onClick={toggleSelectedArchive} disabled={!selectedThread}>{selectedThread?.archived ? <RefreshCw size={14} /> : <Archive size={14} />}{selectedThread?.archived ? "恢复" : "归档"}</button>
          <button className={rightOpen ? "icon-button active" : "icon-button"} onClick={() => setRightOpen((value) => !value)} aria-label="切换检查器"><SlidersHorizontal size={16} /></button>
        </header>

        <div className="conversation-shell">
          <section className="conversation-pane" aria-label="任务对话">
            <div className="conversation-scroll">
              <ThreadContent thread={selectedThread} activeTurnId={activeTurnId} onRetry={retryTurn} onStarter={(value) => setPrompt(value)} />
            </div>
            <div className="composer-zone">
              {notice && <div className="composer-notice" role="status">{notice}</div>}
              {selectedModelId !== "codex" && !selectedProvider?.configured && <button className="key-callout" onClick={() => setSettingsOpen(true)}><WandSparkles size={15} />先配置 {selectedProvider?.name ?? "对应平台"} 凭证才能调用该模型</button>}
              {attachments.length > 0 && <div className="attachment-strip" aria-label="已添加附件">
                {attachments.map((attachment, index) => <span key={`${attachment.path}-${index}`}><Paperclip size={12} />{attachment.name}<button aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index))}><X size={11} /></button></span>)}
              </div>}
              {selectedSkills.length > 0 && <div className="skill-selection-strip" aria-label="已选择 Skills">
                {selectedSkills.map((skill) => <span key={skill.path}><Library size={12} />{skill.displayName ?? skill.name}<button aria-label={`移除 ${skill.displayName ?? skill.name}`} onClick={() => setSelectedSkills((current) => current.filter((item) => item.path !== skill.path))}><X size={11} /></button></span>)}
              </div>}
              <div className="composer">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
                  }}
                  placeholder={selectedModelId === "codex" ? "描述一个任务，AIYOU 会在工作区内完成它" : `向 ${selectedModel?.name ?? "模型"} 提交任务`}
                  aria-label="任务描述"
                />
                <div className="composer-actions">
                  <button className="icon-button" aria-label="添加附件" onClick={chooseAttachments}><Paperclip size={16} /></button>
                  <ModelPicker value={selectedModelId} models={conversationModels} providers={providers} defaultModelId={settings.defaultModels.text} onChange={selectModel} />
                  <SkillPicker skills={capabilities.skills} selected={selectedSkills} errorCount={capabilities.skillErrors.length} onChange={setSelectedSkills} onOpenLibrary={openSkillLibrary} />
                  <button className="generation-launch" onClick={openGeneration} aria-label="打开图片、音频或视频生成"><WandSparkles size={14} />生成</button>
                  <div className="composer-spacer" />
                  <span className="approval-label"><CircleDot size={12} />{settings.approvalPolicy === "on-request" ? "按需审批" : settings.approvalPolicy}</span>
                  {sending ? <button className="send-button stop" onClick={stopCurrentRun} aria-label="停止当前 Turn"><Square size={13} fill="currentColor" /></button> : <button className="send-button" onClick={send} disabled={!prompt.trim() && attachments.length === 0 && selectedSkills.length === 0} aria-label="发送任务"><SendHorizontal size={16} /></button>}
                </div>
              </div>
              <div className="composer-hint">⌘ Enter 发送 · AIYOU 可能会出错，请检查文件改动和模型费用。</div>
            </div>
          </section>

          {rightOpen && (
            <aside className="inspector" aria-label="任务检查器">
              <Tabs.Root defaultValue="context" className="inspector-tabs">
                <Tabs.List className="inspector-tablist" aria-label="检查器标签">
                  <Tabs.Trigger value="context">上下文</Tabs.Trigger>
                  <Tabs.Trigger value="params">参数</Tabs.Trigger>
                  <Tabs.Trigger value="results">运行</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="context" className="inspector-content">
                  <section className="inspector-section"><h3>工作区</h3><button className="context-card" onClick={chooseWorkspace}><Folder size={16} /><span><strong>{shortPath(workspace)}</strong><small>{workspace ?? "点击选择本地目录"}</small></span></button></section>
                  <section className="inspector-section"><h3>当前任务</h3><div className="key-value identifier"><span>Thread ID</span><code>{selectedThread?.id ?? "未创建"}</code></div><div className="key-value identifier"><span>Turn ID</span><code>{activeTurnId ?? selectedThread?.turns?.at(-1)?.id ?? "未开始"}</code></div><div className="key-value"><span>分支</span><span>{selectedThread?.gitInfo?.branch ?? "未检测"}</span></div><div className="key-value"><span>沙箱</span><span>{settings.sandbox}</span></div><div className="key-value"><span>审批</span><span>{settings.approvalPolicy}</span></div></section>
                  <section className="inspector-section"><h3>可用能力</h3><div className="capability-grid"><span><Code2 />代码与终端</span><span><FileStack />文件差异</span><span><Layers3 />{capabilities.skills.length} Skills</span><span><Plug />{capabilities.mcpServers.length} MCP</span><span><AppWindow />{capabilities.apps.length} Apps</span><span><Sparkles />{models.length} 个模型</span></div></section>
                </Tabs.Content>
                <Tabs.Content value="params" className="inspector-content">
                  <section className="inspector-section"><h3>对话模型</h3><div className="model-detail"><div className="model-detail__icon"><Braces size={18} /></div><div><strong>{selectedModel?.name ?? "Codex 默认 Agent"}</strong><small>{selectedModel?.nativeModelId ?? selectedModel?.id ?? "由本机 Codex 配置决定"}</small></div></div>{selectedModel && <><p className="inspector-copy">{selectedModel.capability}</p><div className="key-value"><span>平台</span><span>{selectedProvider?.name ?? selectedModel.providerName}</span></div><div className="key-value"><span>输出</span><code>流式</code></div></>}<button className="button secondary full" onClick={openGeneration}><Play size={14} />打开多媒体生成</button></section>
                  <section className="inspector-section"><h3>模型目录</h3><div className="key-value"><span>平台覆盖</span><span>{coverage.providers} 个</span></div><div className="key-value"><span>官方 / 云</span><span>{coverage.officialOrCloud} 个</span></div><div className="key-value"><span>AI Task MCP</span><span>v{AI_TASK_DOCS.version} · {AI_TASK_DOCS.capturedAt}</span></div><button className="button quiet full" onClick={async () => setModels(await window.harness.models.refresh(selectedProvider?.id))}>同步官方模型目录</button></section>
                </Tabs.Content>
                <Tabs.Content value="results" className="inspector-content run-log">
                  <section className="inspector-section"><h3>实时事件 <span>{events.length}</span></h3>{events.length === 0 && <div className="run-empty"><Box size={22} /><p>Agent 事件会出现在这里</p></div>}{events.slice().reverse().map((event, index) => <div className="run-row" key={`${event.method}-${index}`}><span /><div><strong>{eventLabel(event)}</strong><small>{event.method}</small></div></div>)}</section>
                </Tabs.Content>
              </Tabs.Root>
            </aside>
          )}
        </div>
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} initialTab={captureView === "defaults" ? "defaults" : "providers"} initial={settings} models={models} providers={providers} plugins={plugins} onSaved={saveAppSettings} onProvidersChange={setProviders} onPluginsChange={setPlugins} />
      <FocusPanel open={focusOpen} onOpenChange={setFocusOpen} models={generationModels} model={selectedGenerationModel} onModelChange={selectGenerationModel} initialPrompt={prompt} settings={settings} provider={selectedGenerationProvider} onTaskChanged={(task) => setGenerationTasks((current) => [task, ...current.filter((item) => item.id !== task.id)])} onNeedSettings={() => { setFocusOpen(false); setSettingsOpen(true); }} />
      <PluginPanel plugin={activePlugin} models={models} providers={providers} settings={settings} capabilities={capabilities} generationTasks={generationTasks} onTasksChange={setGenerationTasks} onOpenChange={(open) => { if (!open) setActivePlugin(null); }} onOpenGeneration={() => { setActivePlugin(null); openGeneration(); }} onOpenSettings={() => { setActivePlugin(null); setSettingsOpen(true); }} onUseSkill={useSkill} onSkillEnabledChange={setSkillEnabled} onRefreshSkills={() => refreshSkills(true).then(() => undefined)} onOpenSkillFolder={openSkillFolder} />
      <ApprovalDialog request={approval} onResolve={resolveApproval} />
    </div>
  );
}
