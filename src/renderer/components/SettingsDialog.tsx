import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AudioLines,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  FolderOpen,
  Image,
  KeyRound,
  LoaderCircle,
  MessageSquareText,
  PackagePlus,
  Plug,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { modelsForDefaultCategory } from "../../shared/modelSelection";
import type {
  AppSettings,
  ConnectionTest,
  MenuPlugin,
  ModelCategory,
  ModelDefinition,
  ProviderModality,
  ProviderState,
} from "../../shared/types";

const modalityOptions: { value: "all" | ProviderModality; label: string; icon?: typeof Film }[] = [
  { value: "all", label: "全部" },
  { value: "llm", label: "LLM", icon: MessageSquareText },
  { value: "image", label: "图片", icon: Image },
  { value: "audio", label: "音频", icon: AudioLines },
  { value: "video", label: "视频", icon: Film },
];

const modalityLabel: Record<ProviderModality, string> = {
  llm: "LLM",
  image: "Image",
  audio: "Audio",
  video: "Video",
};

const defaultCategories: { category: ModelCategory; label: string; description: string }[] = [
  { category: "text", label: "默认 LLM", description: "新对话和未指定模型的文本请求" },
  { category: "image", label: "默认图片模型", description: "图片生成与编辑" },
  { category: "audio", label: "默认音频模型", description: "语音合成、复刻与音频任务" },
  { category: "video", label: "默认视频模型", description: "文生视频、图生视频与视频编辑" },
  { category: "processing", label: "默认处理模型", description: "超分、擦除及媒体后处理" },
];

const kindLabel = {
  official: "官方",
  cloud: "官方云",
  aggregator: "聚合平台",
  compatible: "兼容接口",
};

const SelectField = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) => (
  <label className="field-stack">
    <span>{label}</span>
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger className="field-control select-field" aria-label={label}>
        <Select.Value /> <ChevronDown size={14} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content compact" position="popper" sideOffset={6}>
          <Select.Viewport className="select-viewport">
            {options.map((option) => (
              <Select.Item className="select-item" key={option.value} value={option.value}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator><Check size={14} /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </label>
);

function ProviderEditor({ provider, onChanged }: { provider: ProviderState; onChanged: (state: ProviderState) => void }) {
  const [baseUrl, setBaseUrl] = useState(provider.profile.baseUrl);
  const [enabled, setEnabled] = useState(provider.profile.enabled);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [values, setValues] = useState(provider.profile.values);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTest | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setBaseUrl(provider.profile.baseUrl);
    setEnabled(provider.profile.enabled);
    setCredentials({});
    setValues(provider.profile.values);
    setVisible({});
    setResult(null);
    setMessage("");
  }, [provider.id, provider.profile.baseUrl, provider.profile.enabled, provider.profile.values]);

  async function save(testAfter = false) {
    setSaving(true);
    setMessage("");
    setResult(null);
    try {
      const next = await window.harness.providers.save({ providerId: provider.id, enabled, baseUrl, values, credentials });
      setCredentials({});
      onChanged(next);
      setMessage("平台配置已保存");
      if (testAfter) {
        setTesting(true);
        setResult(await window.harness.providers.test(provider.id));
      }
    } catch (error) {
      setResult({ ok: false, status: 0, message: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setSaving(false);
      setTesting(false);
    }
  }

  async function removeCredentials() {
    const next = await window.harness.providers.removeCredentials(provider.id);
    setCredentials({});
    setResult(null);
    onChanged(next);
    setMessage("已删除该平台的全部凭证");
  }

  return (
    <section className="provider-editor" aria-label={`${provider.name} 配置`}>
      <div className="provider-editor__header">
        <div className="provider-monogram">{provider.name.slice(0, 2).toUpperCase()}</div>
        <div className="provider-editor__title">
          <div><h3>{provider.name}</h3><span className={`provider-kind ${provider.kind}`}>{kindLabel[provider.kind]}</span></div>
          <p>{provider.description}</p>
        </div>
        <div className="provider-enabled">
          <span>{enabled ? "已启用" : "未启用"}</span>
          <Switch.Root className="switch-root" checked={enabled} onCheckedChange={setEnabled} aria-label={`启用 ${provider.name}`}><Switch.Thumb className="switch-thumb" /></Switch.Root>
        </div>
      </div>

      <div className="provider-meta-row">
        <span className={provider.configured ? "connection-pill connected" : "connection-pill"}><i />{provider.configured ? "凭证已配置" : "等待配置"}</span>
        <span className="support-pill">{provider.support === "native" ? "原生调用" : "原生凭证 / 待签名适配"}</span>
        <button className="docs-link" onClick={() => window.harness.generation.openExternal(provider.docsUrl)}>官方文档 <ExternalLink size={12} /></button>
      </div>

      <div className="provider-modality-row">
        {provider.modalities.map((item) => <span key={item}>{modalityLabel[item]}</span>)}
        <small>{provider.models.length} 个内置模型种子 · 配置后可同步官方目录</small>
      </div>

      <label className="field-stack">
        <span>API 服务地址</span>
        <input className="field-control mono" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} spellCheck={false} />
      </label>

      <div className="provider-fields">
        {provider.credentialFields.map((item) => {
          const isSecret = item.secret !== false;
          const current = isSecret ? (credentials[item.id] ?? "") : (values[item.id] ?? "");
          const configured = provider.credentialStatus[item.id];
          return (
            <label className="field-stack" key={item.id}>
              <span>{item.label}{item.required === false ? "（可选）" : ""}</span>
              <div className={isSecret ? "secret-input" : undefined}>
                <input
                  className={isSecret ? undefined : "field-control"}
                  type={isSecret && !visible[item.id] ? "password" : "text"}
                  value={current}
                  onChange={(event) => isSecret ? setCredentials((state) => ({ ...state, [item.id]: event.target.value })) : setValues((state) => ({ ...state, [item.id]: event.target.value }))}
                  placeholder={configured ? "已安全配置；输入新值可替换" : item.placeholder}
                  autoComplete="off"
                  aria-label={`${provider.name} ${item.label}`}
                />
                {isSecret && <button type="button" onClick={() => setVisible((state) => ({ ...state, [item.id]: !state[item.id] }))} aria-label={visible[item.id] ? `隐藏 ${item.label}` : `显示 ${item.label}`}>{visible[item.id] ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
              </div>
              {item.help && <small>{item.help}</small>}
            </label>
          );
        })}
      </div>

      {result && <div role="status" aria-live="polite" className={result.ok ? "inline-notice success" : "inline-notice error"}><ShieldCheck size={15} /><span>{result.message}{result.modelCount ? ` · ${result.modelCount} 个模型` : ""}</span></div>}
      {message && !result && <div className="provider-save-message" aria-live="polite">{message}</div>}
      <div className="provider-editor__actions">
        {provider.configured && <button className="button quiet danger" onClick={removeCredentials}><Trash2 size={14} />删除凭证</button>}
        <div />
        <button className="button secondary" onClick={() => save(false)} disabled={saving}>{saving ? "保存中…" : "保存"}</button>
        <button className="button primary" onClick={() => save(true)} disabled={saving || testing}>{testing ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}{testing ? "验证中…" : "保存并验证"}</button>
      </div>
    </section>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "providers",
  initial,
  models,
  providers,
  plugins,
  onSaved,
  onProvidersChange,
  onPluginsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: "providers" | "defaults";
  initial: AppSettings;
  models: ModelDefinition[];
  providers: ProviderState[];
  plugins: MenuPlugin[];
  onSaved: (settings: AppSettings) => void;
  onProvidersChange: (providers: ProviderState[]) => void;
  onPluginsChange: (plugins: MenuPlugin[]) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [modality, setModality] = useState<"all" | ProviderModality>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("ai-task-mcp");
  const [message, setMessage] = useState("");

  useEffect(() => setDraft(initial), [initial]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return providers.filter((item) => (modality === "all" || item.modalities.includes(modality)) && (!needle || `${item.name} ${item.description}`.toLowerCase().includes(needle)));
  }, [modality, providers, query]);
  const selected = providers.find((item) => item.id === selectedId) ?? filtered[0] ?? providers[0];

  function replaceProvider(next: ProviderState) {
    onProvidersChange(providers.map((item) => item.id === next.id ? next : item));
  }

  async function saveSettings() {
    try {
      const next = await window.harness.settings.set(draft);
      onSaved(next);
      setMessage("Agent 与界面设置已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function togglePlugin(pluginId: string, enabled: boolean) {
    onPluginsChange(await window.harness.plugins.setEnabled(pluginId, enabled));
  }

  async function installPlugin() {
    try {
      onPluginsChange(await window.harness.plugins.install());
      setMessage("插件已安装；其菜单和 Skills 将在运行时重新加载");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件安装失败");
    }
  }

  async function uninstallPlugin(pluginId: string) {
    try {
      onPluginsChange(await window.harness.plugins.uninstall(pluginId));
      setMessage("插件已移到废纸篓");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件卸载失败");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="settings-dialog settings-dialog--wide" aria-describedby="settings-description">
          <div className="dialog-titlebar">
            <div><Dialog.Title>AIYOU 设置</Dialog.Title><Dialog.Description id="settings-description">官方模型平台、Agent 权限与菜单插件</Dialog.Description></div>
            <Dialog.Close className="icon-button" aria-label="关闭设置"><X size={16} /></Dialog.Close>
          </div>

          <Tabs.Root defaultValue={initialTab} className="settings-tabs">
            <Tabs.List className="settings-tablist" aria-label="设置分类">
              <Tabs.Trigger value="providers"><KeyRound size={15} />模型平台</Tabs.Trigger>
              <Tabs.Trigger value="defaults"><SlidersHorizontal size={15} />默认模型</Tabs.Trigger>
              <Tabs.Trigger value="agent"><ShieldCheck size={15} />Codex Agent</Tabs.Trigger>
              <Tabs.Trigger value="plugins"><Plug size={15} />菜单插件 <em>{plugins.filter((item) => item.enabled).length}</em></Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="providers" className="settings-tabcontent provider-settings">
              <div className="provider-browser">
                <div className="provider-browser__summary"><strong>{providers.length} 个平台</strong><span>{providers.filter((item) => item.configured).length} 已配置 · {providers.filter((item) => item.kind === "official" || item.kind === "cloud").length} 官方/云平台</span></div>
                <div className="provider-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型平台" aria-label="搜索模型平台" /></div>
                <div className="provider-filters" role="group" aria-label="按模态筛选">
                  {modalityOptions.map((item) => {
                    const Icon = item.icon;
                    return <button key={item.value} className={modality === item.value ? "active" : ""} onClick={() => setModality(item.value)}>{Icon && <Icon size={12} />}{item.label}</button>;
                  })}
                </div>
                <div className="provider-list">
                  {filtered.map((item) => (
                    <button key={item.id} className={selected?.id === item.id ? "provider-card active" : "provider-card"} onClick={() => setSelectedId(item.id)}>
                      <span className="provider-card__mark">{item.name.slice(0, 2).toUpperCase()}</span>
                      <span className="provider-card__copy"><strong>{item.name}</strong><small>{item.modalities.map((entry) => modalityLabel[entry]).join(" · ")}</small></span>
                      <span className={item.configured ? "provider-card__state configured" : "provider-card__state"} title={item.configured ? "已配置" : "未配置"} />
                    </button>
                  ))}
                </div>
              </div>
              {selected && <ProviderEditor provider={selected} onChanged={replaceProvider} />}
            </Tabs.Content>

            <Tabs.Content value="defaults" className="settings-tabcontent simple-settings">
              <section className="settings-section">
                <div className="settings-section__heading"><SlidersHorizontal size={17} /><div><h3>各类型唯一默认模型</h3><p>未手动切换、且提示词未明确点名模型时，AIYOU 会按任务类型自动使用这里的唯一默认项。</p></div></div>
                <div className="default-model-grid">
                  {defaultCategories.map(({ category, label, description }) => {
                    const options = modelsForDefaultCategory(models, category).map((model) => ({
                      value: model.id,
                      label: `${model.name} · ${model.providerName ?? "模型平台"}`,
                    }));
                    if (category === "text") options.unshift({ value: "codex", label: "Codex 默认 Agent · 本机" });
                    return <div className="default-model-row" key={category}>
                      <div><strong>{label}</strong><small>{description}</small></div>
                      <SelectField
                        label={label}
                        value={draft.defaultModels[category]}
                        options={options}
                        onChange={(value) => setDraft({ ...draft, defaultModels: { ...draft.defaultModels, [category]: value } })}
                      />
                    </div>;
                  })}
                </div>
                <button className="button primary settings-save" onClick={saveSettings}>保存默认模型</button>
                <div className="dialog-footer__message" aria-live="polite">{message}</div>
              </section>
            </Tabs.Content>

            <Tabs.Content value="agent" className="settings-tabcontent simple-settings">
              <section className="settings-section">
                <div className="settings-section__heading"><ShieldCheck size={17} /><div><h3>Codex Agent</h3><p>本机 app-server、审批与沙箱策略</p></div></div>
                <label className="field-stack"><span>Codex 命令</span><input className="field-control mono" value={draft.codexCommand} onChange={(event) => setDraft({ ...draft, codexCommand: event.target.value })} /></label>
                <div className="field-grid">
                  <SelectField label="审批策略" value={draft.approvalPolicy} onChange={(value) => setDraft({ ...draft, approvalPolicy: value as AppSettings["approvalPolicy"] })} options={[{ value: "on-request", label: "按需审批" }, { value: "untrusted", label: "仅信任安全命令" }, { value: "never", label: "从不询问" }]} />
                  <SelectField label="沙箱" value={draft.sandbox} onChange={(value) => setDraft({ ...draft, sandbox: value as AppSettings["sandbox"] })} options={[{ value: "workspace-write", label: "允许工作区写入" }, { value: "read-only", label: "只读" }, { value: "danger-full-access", label: "完全访问" }]} />
                </div>
                <SelectField label="界面主题" value={draft.theme} onChange={(value) => setDraft({ ...draft, theme: value as AppSettings["theme"] })} options={[{ value: "system", label: "跟随系统" }, { value: "light", label: "浅色" }, { value: "dark", label: "深色" }]} />
                <button className="button primary settings-save" onClick={saveSettings}>保存 Agent 设置</button>
                <div className="dialog-footer__message" aria-live="polite">{message}</div>
              </section>
            </Tabs.Content>

            <Tabs.Content value="plugins" className="settings-tabcontent simple-settings">
              <section className="settings-section">
                <div className="settings-section__heading"><Plug size={17} /><div><h3>菜单插件</h3><p>控制左侧快捷模块与“更多插件”菜单中的入口</p></div></div>
                <div className="plugin-settings-list">
                  {plugins.map((plugin) => (
                    <div className="plugin-setting-row" key={plugin.id}>
                      <span className="plugin-setting-row__icon"><Plug size={15} /></span>
                      <span className="plugin-setting-row__copy"><strong>{plugin.name}{plugin.version ? ` · v${plugin.version}` : ""}</strong><small>{plugin.description} · {plugin.source === "codex-plugin" ? "Codex 插件包" : plugin.placement === "both" ? "快捷区与菜单" : plugin.placement === "quick" ? "快捷区" : "插件菜单"}</small></span>
                      {plugin.shortcut && <kbd>{plugin.shortcut}</kbd>}
                      {!plugin.builtIn && <button className="icon-button danger" onClick={() => uninstallPlugin(plugin.id)} aria-label={`卸载${plugin.name}`}><Trash2 size={14} /></button>}
                      <Switch.Root className="switch-root" checked={plugin.enabled} onCheckedChange={(enabled) => togglePlugin(plugin.id, enabled)} aria-label={`${plugin.enabled ? "禁用" : "启用"}${plugin.name}`}><Switch.Thumb className="switch-thumb" /></Switch.Root>
                    </div>
                  ))}
                </div>
                <div className="plugin-settings-actions"><button className="button primary" onClick={installPlugin}><PackagePlus size={14} />安装 Codex 插件目录</button><button className="button secondary plugin-folder-button" onClick={() => window.harness.plugins.openFolder()}><FolderOpen size={14} />打开插件目录</button></div>
                <div className="dialog-footer__message" aria-live="polite">{message}</div>
                <p className="plugin-api-note">支持含 `.codex-plugin/plugin.json` 的本地插件包，以及兼容的声明式菜单清单。插件不允许读取 Provider 明文凭证；Skills、MCP 与 Apps 仍由 Agent Runtime 管理。</p>
              </section>
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
