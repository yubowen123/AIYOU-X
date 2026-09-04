import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  LoaderCircle,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CATEGORY_LABELS, VIDEO_ROUTE_IDS } from "../../shared/modelCatalog";
import type { AppSettings, GenerationResponse, GenerationTask, ModelDefinition, ProviderState } from "../../shared/types";

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function findFirstString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === "string" && candidate) return candidate;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const result = findFirstString(item, keys);
        if (result) return result;
      }
    } else if (child && typeof child === "object") {
      const result = findFirstString(child, keys);
      if (result) return result;
    }
  }
  return undefined;
}

export function FocusPanel({
  open,
  onOpenChange,
  model,
  models,
  onModelChange,
  initialPrompt,
  settings,
  provider,
  onTaskChanged,
  onNeedSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model?: ModelDefinition;
  models: ModelDefinition[];
  onModelChange: (modelId: string) => void;
  initialPrompt: string;
  settings: AppSettings;
  provider?: ProviderState;
  onTaskChanged: (task: GenerationTask) => void;
  onNeedSettings: () => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [media, setMedia] = useState("");
  const [secondaryMedia, setSecondaryMedia] = useState("");
  const [duration, setDuration] = useState("5");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [count, setCount] = useState("1");
  const [operation, setOperation] = useState("tts");
  const [voiceId, setVoiceId] = useState("");
  const [scene, setScene] = useState("general");
  const [advanced, setAdvanced] = useState("{}");
  const [useRoute, setUseRoute] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [taskId, setTaskId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setPrompt(initialPrompt), [initialPrompt]);
  useEffect(() => {
    setResult(null);
    setTaskId("");
    setError("");
    setUseRoute(false);
  }, [model?.id]);

  const routeAvailable = useMemo(
    () => Boolean(model && VIDEO_ROUTE_IDS.includes(model.id as (typeof VIDEO_ROUTE_IDS)[number])),
    [model],
  );
  const resultUrl = findFirstString(result?.data, ["url", "videoUrl", "audioUrl", "imageUrl"]);

  if (!model) return null;
  const requiredModel = model;

  function buildPayload() {
    let extra: Record<string, unknown>;
    try {
      extra = JSON.parse(advanced || "{}") as Record<string, unknown>;
    } catch {
      throw new Error("高级参数不是有效 JSON");
    }
    const common = { userId: settings.userId, userName: settings.userName };
    if (requiredModel.category === "video") {
      return {
        ...extra,
        ...common,
        prompt,
        referenceImageUrls: lines(media),
        referenceVideoUrls: lines(secondaryMedia),
        duration: Number(duration),
        aspectRatio,
        resolution,
      };
    }
    if (requiredModel.category === "image") {
      return {
        ...extra,
        ...common,
        prompt,
        imageUrls: lines(media),
        count: Number(count),
        aspectRatio,
        resolution,
      };
    }
    if (requiredModel.category === "text") {
      return { ...extra, ...common, question: prompt };
    }
    if (requiredModel.category === "audio") {
      return {
        ...extra,
        ...common,
        operation,
        text: prompt,
        referenceAudioUrl: media.trim(),
        voiceId: voiceId.trim(),
        format: "mp3",
      };
    }
    const isErase = requiredModel.id.includes("erase") || requiredModel.id === "video-detext";
    return {
      ...extra,
      ...common,
      ...(isErase ? { videoUrl: media.trim() } : { mediaUrl: media.trim() }),
      scene,
      resolution,
    };
  }

  async function submit() {
    setError("");
    if (!provider?.configured) {
      onNeedSettings();
      return;
    }
    setSubmitting(true);
    try {
      const response = await window.harness.generation.submit({
        model: requiredModel.id,
        payload: buildPayload(),
        useRoute,
      });
      setResult(response);
      if (response.task) onTaskChanged(response.task);
      setTaskId(response.task?.remoteTaskId ?? findFirstString(response.data, ["taskId", "id"]) ?? "");
      if (!response.success) setError(response.error ?? "提交失败");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function queryStatus() {
    if (!taskId) return;
    setSubmitting(true);
    setError("");
    const response = await window.harness.generation.status(requiredModel.id, taskId, useRoute, operation);
    setResult(response);
    if (response.task) onTaskChanged(response.task);
    if (!response.success) setError(response.error ?? "查询失败");
    setSubmitting(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="focus-overlay" />
        <Dialog.Content className="focus-panel" aria-describedby="focus-description">
          <header className="focus-header">
            <div>
              <div className="focus-eyebrow">{CATEGORY_LABELS[model.category]} · {provider?.name ?? model.providerName ?? "模型平台"}</div>
              <Dialog.Title>{model.name}</Dialog.Title>
              <Dialog.Description id="focus-description">{model.capability}</Dialog.Description>
            </div>
            <Select.Root value={model.id} onValueChange={onModelChange}>
              <Select.Trigger className="generation-model-trigger" aria-label="选择生成路由模型">
                <span><RefreshCw size={13} />切换生成模型</span><ChevronDown size={13} />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content generation-model-menu" position="popper" sideOffset={7} align="end">
                  <Select.Viewport className="select-viewport">
                    {(["image", "audio", "video", "processing", "text"] as const).map((category) => {
                      const list = models.filter((item) => item.category === category);
                      if (!list.length) return null;
                      return <Select.Group key={category}>
                        <Select.Label className="select-label">{CATEGORY_LABELS[category]}</Select.Label>
                        {list.map((item) => <Select.Item className="select-item" key={item.id} value={item.id}>
                          <Select.ItemText>{item.name}</Select.ItemText>
                          <span className="select-item__id">{item.providerName}</span>
                          <Select.ItemIndicator><Check size={14} /></Select.ItemIndicator>
                        </Select.Item>)}
                        <Select.Separator className="select-separator" />
                      </Select.Group>;
                    })}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
            <Dialog.Close className="icon-button" aria-label="关闭生成面板"><X size={17} /></Dialog.Close>
          </header>

          <div className="focus-body">
            <div className="focus-form">
              <label className="field-stack">
                <span>{model.category === "audio" ? "合成文本 / 试听文本" : model.category === "processing" ? "处理说明（可选）" : "提示词"}</span>
                <textarea className="field-control prompt-large" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你希望 AIYOU 完成的内容…" />
              </label>

              {(model.category === "video" || model.category === "image") && (
                <label className="field-stack">
                  <span>{model.category === "video" ? "参考图片 URL（每行一个）" : "参考图 URL（每行一个）"}</span>
                  <textarea className="field-control mono media-input" value={media} onChange={(event) => setMedia(event.target.value)} placeholder="https://…" />
                </label>
              )}
              {model.category === "video" && (
                <label className="field-stack"><span>参考视频 URL（每行一个）</span><textarea className="field-control mono media-input" value={secondaryMedia} onChange={(event) => setSecondaryMedia(event.target.value)} placeholder="https://…" /></label>
              )}
              {model.category === "audio" && (
                <>
                  <div className="segmented" role="group" aria-label="音频任务类型">
                    <button className={operation === "tts" ? "active" : ""} onClick={() => setOperation("tts")}>文本转语音</button>
                    <button className={operation === "clone" ? "active" : ""} onClick={() => setOperation("clone")}>声音复刻</button>
                  </div>
                  <label className="field-stack"><span>参考音频 URL</span><input className="field-control mono" value={media} onChange={(event) => setMedia(event.target.value)} placeholder="https://…/voice.wav" /></label>
                  <label className="field-stack"><span>Voice ID / Speaker ID（按模型选填）</span><input className="field-control mono" value={voiceId} onChange={(event) => setVoiceId(event.target.value)} /></label>
                </>
              )}
              {model.category === "processing" && (
                <label className="field-stack"><span>待处理视频 URL</span><input className="field-control mono" value={media} onChange={(event) => setMedia(event.target.value)} placeholder="https://…/input.mp4" /></label>
              )}

              {(model.category === "video" || model.category === "image" || model.category === "processing") && (
                <div className="field-grid three">
                  {model.category === "video" && <label className="field-stack"><span>时长</span><input className="field-control" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>}
                  {model.category === "image" && <label className="field-stack"><span>数量</span><input className="field-control" value={count} onChange={(event) => setCount(event.target.value)} /></label>}
                  <label className="field-stack"><span>分辨率</span><input className="field-control" value={resolution} onChange={(event) => setResolution(event.target.value)} /></label>
                  {model.category !== "processing" && <label className="field-stack"><span>宽高比</span><input className="field-control" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} /></label>}
                  {model.category === "processing" && <label className="field-stack"><span>场景</span><input className="field-control" value={scene} onChange={(event) => setScene(event.target.value)} /></label>}
                </div>
              )}

              {routeAvailable && (
                <div className="switch-row">
                  <div><strong>使用模型路由</strong><span>由平台在候选通道中选择</span></div>
                  <Switch.Root className="switch-root" checked={useRoute} onCheckedChange={setUseRoute}><Switch.Thumb className="switch-thumb" /></Switch.Root>
                </div>
              )}

              <details className="advanced-details">
                <summary><ClipboardList size={14} /> 高级参数 JSON</summary>
                <textarea className="field-control mono advanced-input" value={advanced} onChange={(event) => setAdvanced(event.target.value)} spellCheck={false} />
                <p>模型专属字段可按接口文档写入；显式表单字段优先。</p>
              </details>

              <div className="billing-warning"><AlertTriangle size={15} /><span>点击“提交到平台”可能产生真实费用。AIYOU 不会自动提交或重试生成任务。</span></div>
              {error && <div className="inline-notice error" role="alert">{error}</div>}
              <button className="button primary submit-generation" onClick={submit} disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
                {submitting ? "正在提交…" : "提交到平台"}
              </button>
            </div>

            <aside className="focus-result">
              <div className="result-heading"><span>任务结果</span>{taskId && <button className="icon-button" onClick={queryStatus} aria-label="刷新任务状态"><RefreshCw size={15} /></button>}</div>
              {!result && <div className="result-empty"><div className="result-empty__orb" /><h3>等待提交</h3><p>任务 ID、状态、计费摘要和媒体结果会显示在这里。</p></div>}
              {result && (
                <div className="result-content">
                  <div className={result.success ? "result-state success" : "result-state error"}>
                    {result.success ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                    <span>{result.success ? "请求已被平台接受" : "请求失败"}</span>
                    <code>HTTP {result.status}</code>
                  </div>
                  {taskId && <div className="result-task"><span>Task ID</span><code>{taskId}</code></div>}
                  {result.task && <><div className="result-task"><span>AIYOU Task</span><code>{result.task.id}</code></div><div className="result-task"><span>生命周期</span><code>{result.task.status}</code></div></>}
                  {resultUrl && <button className="result-preview-link" onClick={() => window.harness.generation.openExternal(resultUrl)}><ArrowUpRight size={15} />打开媒体结果</button>}
                  <pre>{JSON.stringify(result.data ?? { error: result.error }, null, 2)}</pre>
                </div>
              )}
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
