import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Boxes, FolderOpen, Library, Play, Power, RefreshCw, Search, Settings2, Sparkles, Workflow, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AppSettings, GenerationTask, MenuPlugin, ModelDefinition, ProviderState, RuntimeCapabilitySnapshot, SkillMetadata, SkillReference, SkillSource } from "../../shared/types";
import { SKILL_SOURCE_LABELS, skillDisplayName } from "../../shared/skills";

const commandIcon = {
  assets: Boxes,
  skills: Library,
  automation: Workflow,
} as const;

function skillGroupLabel(cwd: string) {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || cwd || "默认工作区";
}

function SkillsWorkspace({
  capabilities,
  workspace,
  onUseSkill,
  onSkillEnabledChange,
  onRefreshSkills,
  onOpenSkillFolder,
}: {
  capabilities: RuntimeCapabilitySnapshot;
  workspace?: string;
  onUseSkill: (skill: SkillReference) => void;
  onSkillEnabledChange: (skill: SkillMetadata, enabled: boolean) => Promise<void>;
  onRefreshSkills: () => Promise<void>;
  onOpenSkillFolder: (path: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [cwdGroup, setCwdGroup] = useState("all");
  const [source, setSource] = useState<"all" | SkillSource>("all");
  const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [selectedPath, setSelectedPath] = useState<string>();
  const [busyPath, setBusyPath] = useState<string>();
  const groupPaths = useMemo(() => new Set(
    capabilities.skillGroups.find((group) => group.cwd === cwdGroup)?.skills.map((skill) => skill.path) ?? [],
  ), [capabilities.skillGroups, cwdGroup]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return capabilities.skills
      .filter((skill) => cwdGroup === "all" || groupPaths.has(skill.path))
      .filter((skill) => source === "all" || skill.source === source)
      .filter((skill) => status === "all" || skill.enabled === (status === "enabled"))
      .filter((skill) => !needle || `${skillDisplayName(skill)} ${skill.name} ${skill.description} ${skill.path}`.toLowerCase().includes(needle));
  }, [capabilities.skills, cwdGroup, groupPaths, query, source, status]);
  const selected = filtered.find((skill) => skill.path === selectedPath) ?? filtered[0];

  async function toggle(skill: SkillMetadata) {
    setBusyPath(skill.path);
    try {
      await onSkillEnabledChange(skill, !skill.enabled);
    } finally {
      setBusyPath(undefined);
    }
  }

  return <div className="plugin-workspace__body skills-workspace">
    <section className="skills-summary">
      <div><strong>{capabilities.skills.filter((skill) => skill.enabled).length}</strong><span>已启用</span></div>
      <div><strong>{capabilities.skillGroups.length}</strong><span>工作区分组</span></div>
      <div className={capabilities.skillErrors.length ? "warning" : ""}><strong>{capabilities.skillErrors.length}</strong><span>加载问题</span></div>
      <button onClick={onRefreshSkills}><RefreshCw size={13} />重新扫描</button>
    </section>
    {capabilities.skillErrors.length > 0 && <details className="skills-error-panel">
      <summary><AlertTriangle size={14} />{capabilities.skillErrors.length} 个 Skill 未能正常加载</summary>
      {capabilities.skillErrors.map((error, index) => <div key={`${error.path}-${index}`}><strong>{error.path || error.cwd || "Skills Runtime"}</strong><span>{error.message}</span></div>)}
    </details>}
    <div className="skills-toolbar">
      <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Skill 名称、描述或路径" /></label>
      <select value={cwdGroup} onChange={(event) => setCwdGroup(event.target.value)} aria-label="Skill 工作区分组"><option value="all">全部工作区</option>{capabilities.skillGroups.map((group) => <option value={group.cwd} key={group.cwd}>{skillGroupLabel(group.cwd)}</option>)}</select>
      <select value={source} onChange={(event) => setSource(event.target.value as "all" | SkillSource)} aria-label="Skill 来源"><option value="all">全部来源</option>{Object.entries(SKILL_SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Skill 状态"><option value="all">全部状态</option><option value="enabled">已启用</option><option value="disabled">已停用</option></select>
    </div>
    <div className="skills-browser">
      <div className="skills-list" aria-label="Skills 列表">
        {filtered.map((skill) => <button className={selected?.path === skill.path ? "active" : ""} onClick={() => setSelectedPath(skill.path)} key={skill.path}>
          <span className="skill-mark" style={skill.interface?.brandColor ? { color: skill.interface.brandColor } : undefined}><Library size={15} /></span>
          <span><strong>{skillDisplayName(skill)}</strong><small>{skill.interface?.shortDescription || skill.shortDescription || skill.description || skill.name}</small></span>
          <em className={skill.enabled ? "enabled" : "disabled"}>{skill.enabled ? "已启用" : "已停用"}</em>
        </button>)}
        {!filtered.length && <div className="skills-empty">没有符合当前筛选的 Skill</div>}
      </div>
      <section className="skill-detail">
        {selected ? <>
          <header><span className="skill-detail__icon"><Library size={18} /></span><div><h3>{skillDisplayName(selected)}</h3><p>{selected.name}</p></div><span className={`skill-status ${selected.enabled ? "enabled" : "disabled"}`}>{selected.enabled ? "已启用" : "已停用"}</span></header>
          <p className="skill-detail__description">{selected.description || selected.interface?.shortDescription || "未提供描述"}</p>
          <div className="skill-detail__meta"><span>来源<strong>{SKILL_SOURCE_LABELS[selected.source]}</strong></span><span>范围<strong>{SKILL_SOURCE_LABELS[selected.scope]}</strong></span><span>依赖<strong>{selected.dependencies?.tools.length ?? 0} 项</strong></span></div>
          {selected.interface?.defaultPrompt && <div className="skill-default-prompt"><strong>建议任务</strong><p>{selected.interface.defaultPrompt}</p></div>}
          {Boolean(selected.dependencies?.tools.length) && <div className="skill-dependencies"><strong>工具依赖</strong>{selected.dependencies!.tools.map((tool, index) => <span key={`${tool.type}-${tool.value}-${index}`}>{tool.type} · {tool.value}</span>)}</div>}
          <code className="skill-path" title={selected.path}>{selected.path}</code>
          <div className="skill-detail__actions">
            <button className="button primary" disabled={!selected.enabled} onClick={() => onUseSkill({ name: selected.name, path: selected.path, displayName: skillDisplayName(selected) })}><Library size={13} />用于当前任务</button>
            <button className="button secondary" disabled={busyPath === selected.path} onClick={() => toggle(selected)}><Power size={13} />{selected.enabled ? "停用" : "启用"}</button>
            <button className="button quiet" onClick={() => onOpenSkillFolder(selected.path)}><FolderOpen size={13} />打开位置</button>
          </div>
        </> : <div className="skills-empty detail"><Library size={25} /><strong>选择一个 Skill 查看详情</strong><span>{workspace ?? "尚未选择工作区"}</span></div>}
      </section>
    </div>
  </div>;
}

export function PluginPanel({
  plugin,
  models,
  providers,
  settings,
  capabilities,
  generationTasks,
  onTasksChange,
  onOpenChange,
  onOpenGeneration,
  onOpenSettings,
  onUseSkill,
  onSkillEnabledChange,
  onRefreshSkills,
  onOpenSkillFolder,
}: {
  plugin: MenuPlugin | null;
  models: ModelDefinition[];
  providers: ProviderState[];
  settings: AppSettings;
  capabilities: RuntimeCapabilitySnapshot;
  generationTasks: GenerationTask[];
  onTasksChange: (tasks: GenerationTask[]) => void;
  onOpenChange: (open: boolean) => void;
  onOpenGeneration: () => void;
  onOpenSettings: () => void;
  onUseSkill: (skill: SkillReference) => void;
  onSkillEnabledChange: (skill: SkillMetadata, enabled: boolean) => Promise<void>;
  onRefreshSkills: () => Promise<void>;
  onOpenSkillFolder: (path: string) => Promise<void>;
}) {
  if (!plugin) return null;
  const Icon = commandIcon[plugin.command as keyof typeof commandIcon] ?? Sparkles;
  const configured = providers.filter((provider) => provider.configured).length;
  const generationCount = models.filter((model) => model.category !== "text").length;

  const capabilityName = (value: Record<string, unknown>) => String(value.displayName ?? value.title ?? value.name ?? value.id ?? "未命名能力");

  async function cancelTask(taskId: string) {
    const task = await window.harness.generation.cancelTask(taskId);
    onTasksChange(generationTasks.map((item) => item.id === task.id ? task : item));
  }

  return <Dialog.Root open modal={false} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Content className={`plugin-workspace plugin-workspace--${plugin.command}`} aria-describedby="plugin-workspace-description">
        <header className="plugin-workspace__header">
          <span><Icon size={19} /></span>
          <div><Dialog.Title>{plugin.name}</Dialog.Title><Dialog.Description id="plugin-workspace-description">{plugin.description}</Dialog.Description></div>
          <Dialog.Close className="icon-button" aria-label={`关闭${plugin.name}`}><X size={16} /></Dialog.Close>
        </header>

        {plugin.command === "assets" && <div className="plugin-workspace__body">
          <div className="plugin-metric-grid">
            <div><strong>{generationCount}</strong><span>可路由生成模型</span></div>
            <div><strong>{configured}</strong><span>已配置平台</span></div>
            <div><strong>{Object.values(settings.defaultModels).filter(Boolean).length}</strong><span>已设置默认类型</span></div>
          </div>
          <section className="plugin-visible-section"><h3>生成资产</h3><p>图片、音频、视频和媒体处理模型已从对话选择器分离，在生成工作台中按类型路由。</p><button className="button primary" onClick={onOpenGeneration}><Play size={14} />打开多媒体生成</button></section>
          {generationTasks.length === 0 ? <section className="plugin-empty-state"><Boxes size={24} /><strong>暂无生成任务</strong><p>提交后会立即建立本地 Task，并持续保存平台 Task ID、状态和结果。</p></section> : <section className="plugin-visible-section"><h3>生成任务生命周期</h3><div className="generation-task-list">{generationTasks.slice(0, 30).map((task) => <div className="generation-task-row" key={task.id}><span><strong>{task.prompt || task.modelId}</strong><small>{task.modelId} · {new Date(task.updatedAt).toLocaleString()}</small></span><code>{task.status}</code>{task.resultUrl && <button onClick={() => window.harness.generation.openExternal(task.resultUrl!)}>打开结果</button>}{!(["completed", "failed", "canceled"] as string[]).includes(task.status) && <button onClick={() => cancelTask(task.id)}>取消本地任务</button>}</div>)}</div></section>}
        </div>}

        {plugin.command === "skills" && <SkillsWorkspace capabilities={capabilities} workspace={settings.lastWorkspace} onUseSkill={(skill) => { onUseSkill(skill); onOpenChange(false); }} onSkillEnabledChange={onSkillEnabledChange} onRefreshSkills={onRefreshSkills} onOpenSkillFolder={onOpenSkillFolder} />}

        {plugin.command === "automation" && <div className="plugin-workspace__body">
          <section className="plugin-visible-section"><h3>自动执行</h3><p>自动化会复用当前工作区、沙箱与审批策略；创建和执行前仍需明确的任务配置。</p><div className="plugin-fact"><Workflow size={15} /><span><strong>{settings.approvalPolicy === "on-request" ? "按需审批" : settings.approvalPolicy}</strong><small>{settings.sandbox}</small></span></div></section>
          <section className="plugin-empty-state"><Workflow size={24} /><strong>暂无自动化任务</strong><p>当前没有已创建的自动化，不再显示误导性的“已经打开”。</p></section>
        </div>}

        {plugin.command === "plugin" && <div className="plugin-workspace__body">
          <section className="plugin-visible-section"><h3>已安装 Codex 插件</h3><p>{plugin.description}</p><div className="plugin-fact"><Sparkles size={15} /><span><strong>{plugin.version ? `v${plugin.version}` : "未声明版本"}</strong><small>{plugin.installedPath ?? "内置插件"}</small></span></div></section>
          <section className="plugin-visible-section"><h3>声明能力</h3><div className="runtime-capability-list"><div>{(plugin.capabilities ?? []).length ? plugin.capabilities?.map((item) => <span key={item}>{item}</span>) : <span>插件未声明附加 MCP / Apps；Skills 会在 Agent Runtime 中按目录加载。</span>}</div></div></section>
        </div>}

        <footer className="plugin-workspace__footer"><button className="button secondary" onClick={onOpenSettings}><Settings2 size={14} />插件与模型设置</button></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
