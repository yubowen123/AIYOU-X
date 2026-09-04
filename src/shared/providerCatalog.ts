import { MODEL_CATALOG } from "./modelCatalog";
import type {
  CredentialFieldDefinition,
  ModelCategory,
  ModelDefinition,
  ProviderDefinition,
  ProviderKind,
  ProviderModality,
  ProviderSupport,
} from "./types";

export const PROVIDER_CATALOG_VERSION = "2026-08-30";
export const MODEL_ID_SEPARATOR = "::";

const apiKey: CredentialFieldDefinition = {
  id: "apiKey",
  label: "API Key",
  placeholder: "仅保存在系统加密凭据中",
  required: true,
  secret: true,
};

const field = (
  id: string,
  label: string,
  options: Partial<CredentialFieldDefinition> = {},
): CredentialFieldDefinition => ({ id, label, required: true, ...options });

const nativeModel = (
  providerId: string,
  id: string,
  name: string,
  category: ModelCategory,
  capability: string,
  protocol: ModelDefinition["protocol"],
  submitPath: string,
  statusPath?: string,
): ModelDefinition => ({
  id: `${providerId}${MODEL_ID_SEPARATOR}${id}`,
  nativeModelId: id,
  name,
  category,
  capability,
  protocol,
  submitPath,
  statusPath,
  providerId,
});

type ProviderInput = Omit<ProviderDefinition, "credentialFields" | "models"> & {
  credentialFields?: CredentialFieldDefinition[];
  models?: ModelDefinition[];
};

const provider = (input: ProviderInput): ProviderDefinition => ({
  credentialFields: [apiKey],
  models: [],
  ...input,
});

const openAiCompatible = (
  id: string,
  name: string,
  description: string,
  kind: ProviderKind,
  baseUrl: string,
  docsUrl: string,
  seedModels: string[],
  modalities: ProviderModality[] = ["llm"],
): ProviderDefinition => provider({
  id,
  name,
  description,
  kind,
  support: "native",
  modalities,
  docsUrl,
  defaultBaseUrl: baseUrl,
  authType: "bearer",
  testPath: "/v1/models",
  modelListPath: "/v1/models",
  modelListShape: "data",
  models: seedModels.map((modelId) => nativeModel(
    id,
    modelId,
    modelId,
    "text",
    "官方 Chat Completions / 工具调用（以账号实际可用能力为准）",
    "chat-completions",
    "/v1/chat/completions",
  )),
});

const aiTaskModels = MODEL_CATALOG.map((model) => ({
  ...model,
  providerId: "ai-task-mcp",
  providerName: "AI Task MCP",
  providerKind: "aggregator" as const,
  nativeModelId: model.id,
  support: "native" as const,
}));

export const PROVIDER_CATALOG: ProviderDefinition[] = [
  provider({
    id: "ai-task-mcp",
    name: "AI Task MCP",
    description: "一次接入覆盖文档中的 76 个三方模型，适合需要统一余额与接口的用户。",
    kind: "aggregator",
    support: "native",
    modalities: ["llm", "image", "audio", "video"],
    docsUrl: "https://ai-mcp.wuread.cn/docs.html#auth",
    defaultBaseUrl: "https://ai-mcp.wuread.cn",
    authType: "dual-key",
    testPath: "/api/v1/video/models",
    modelListPath: "/api/v1/video/models",
    modelListShape: "data",
    models: aiTaskModels,
  }),
  provider({
    id: "openai",
    name: "OpenAI",
    description: "官方 Responses、图像、语音与视频 API。",
    kind: "official",
    support: "native",
    modalities: ["llm", "image", "audio", "video"],
    docsUrl: "https://platform.openai.com/docs/api-reference",
    consoleUrl: "https://platform.openai.com/api-keys",
    defaultBaseUrl: "https://api.openai.com",
    authType: "bearer",
    testPath: "/v1/models",
    modelListPath: "/v1/models",
    modelListShape: "data",
    models: [
      nativeModel("openai", "gpt-5.6-sol", "GPT-5.6 Sol", "text", "旗舰推理与 Agent", "responses", "/v1/responses"),
      nativeModel("openai", "gpt-5.6-terra", "GPT-5.6 Terra", "text", "智能与成本平衡", "responses", "/v1/responses"),
      nativeModel("openai", "gpt-5.6-luna", "GPT-5.6 Luna", "text", "高吞吐低成本", "responses", "/v1/responses"),
      nativeModel("openai", "gpt-image-2", "GPT Image 2", "image", "官方图像生成与编辑", "native-http", "/v1/images/generations"),
      nativeModel("openai", "gpt-4o-mini-tts", "GPT-4o mini TTS", "audio", "文本转语音", "native-http", "/v1/audio/speech"),
      nativeModel("openai", "sora-2", "Sora 2", "video", "带同步音频的视频生成", "native-http", "/v1/videos", "/v1/videos/{taskId}"),
    ],
  }),
  provider({
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Claude 官方 Messages API 与动态模型目录。",
    kind: "official",
    support: "native",
    modalities: ["llm"],
    docsUrl: "https://platform.claude.com/docs/en/api/overview",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    defaultBaseUrl: "https://api.anthropic.com",
    authType: "anthropic",
    extraHeaders: { "anthropic-version": "2023-06-01" },
    testPath: "/v1/models",
    modelListPath: "/v1/models",
    modelListShape: "data",
    models: [
      nativeModel("anthropic", "claude-opus-5", "Claude Opus 5", "text", "复杂推理、编码与 Agent", "anthropic-messages", "/v1/messages"),
    ],
  }),
  provider({
    id: "google-gemini",
    name: "Google Gemini",
    description: "Google AI Studio 原生 Gemini、Imagen、TTS 与 Veo。",
    kind: "official",
    support: "native",
    modalities: ["llm", "image", "audio", "video"],
    docsUrl: "https://ai.google.dev/api",
    consoleUrl: "https://aistudio.google.com/app/apikey",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    authType: "google-api-key",
    testPath: "/v1beta/models",
    modelListPath: "/v1beta/models",
    modelListShape: "models",
    models: [
      nativeModel("google-gemini", "gemini-3.6-flash", "Gemini 3.6 Flash", "text", "多模态理解与 Agent", "gemini-generate", "/v1beta/models/{model}:generateContent"),
      nativeModel("google-gemini", "gemini-3.1-pro-preview", "Gemini 3.1 Pro", "text", "高级推理与编码", "gemini-generate", "/v1beta/models/{model}:generateContent"),
      nativeModel("google-gemini", "gemini-3.1-flash-image", "Nano Banana 2", "image", "图像生成与编辑", "gemini-generate", "/v1beta/models/{model}:generateContent"),
      nativeModel("google-gemini", "gemini-3.1-flash-tts-preview", "Gemini Flash TTS", "audio", "原生语音生成", "gemini-generate", "/v1beta/models/{model}:generateContent"),
      nativeModel("google-gemini", "veo-3.1-generate-preview", "Veo 3.1", "video", "文本/图片生成视频", "native-http", "/v1beta/models/{model}:predictLongRunning"),
    ],
  }),
  openAiCompatible("xai", "xAI", "Grok 官方 API 与实时搜索工具。", "official", "https://api.x.ai", "https://docs.x.ai/docs/api-reference", ["grok-4", "grok-3"]),
  openAiCompatible("deepseek", "DeepSeek", "DeepSeek 官方模型与 OpenAI 兼容协议。", "official", "https://api.deepseek.com", "https://api-docs.deepseek.com", ["deepseek-v4-pro", "deepseek-v4-flash"]),
  openAiCompatible("mistral", "Mistral AI", "Mistral 官方 Chat、OCR 与 Voxtral 音频模型。", "official", "https://api.mistral.ai", "https://docs.mistral.ai/api", ["mistral-medium-latest", "mistral-small-latest", "voxtral-small-latest"], ["llm", "audio"]),
  provider({
    id: "cohere",
    name: "Cohere",
    description: "Command 系列、Rerank 与 Embed 官方平台。",
    kind: "official",
    support: "native",
    modalities: ["llm"],
    docsUrl: "https://docs.cohere.com/reference/about",
    defaultBaseUrl: "https://api.cohere.com",
    authType: "bearer",
    testPath: "/v1/models",
    modelListPath: "/v1/models",
    modelListShape: "models",
    models: [nativeModel("cohere", "command-a-03-2025", "Command A", "text", "企业级 Agent 与 RAG", "native-http", "/v2/chat")],
  }),
  openAiCompatible("moonshot", "Moonshot AI", "Moonshot / Kimi 官方开放平台。", "official", "https://api.moonshot.cn", "https://platform.moonshot.cn/docs", ["kimi-k2.5", "moonshot-v1-auto"]),
  provider({
    id: "zhipu",
    name: "智谱 BigModel",
    description: "GLM 官方文本与多模态开放平台。",
    kind: "official",
    support: "native",
    modalities: ["llm", "image", "video"],
    docsUrl: "https://docs.bigmodel.cn/cn/guide/start/introduction",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    authType: "bearer",
    testPath: "/models",
    modelListPath: "/models",
    modelListShape: "data",
    models: [
      nativeModel("zhipu", "glm-5", "GLM-5", "text", "官方 Chat Completions 与工具调用", "chat-completions", "/chat/completions"),
      nativeModel("zhipu", "glm-4.6v", "GLM-4.6V", "text", "视觉多模态理解", "chat-completions", "/chat/completions"),
    ],
  }),
  provider({
    id: "minimax",
    name: "MiniMax",
    description: "官方文本、语音、图像、音乐与海螺视频全模态平台。",
    kind: "official",
    support: "native",
    modalities: ["llm", "image", "audio", "video"],
    docsUrl: "https://platform.minimaxi.com/docs/api-reference/api-overview",
    defaultBaseUrl: "https://api.minimaxi.com",
    authType: "bearer",
    testPath: "/v1/models",
    modelListPath: "/v1/models",
    modelListShape: "data",
    models: [
      nativeModel("minimax", "MiniMax-M2.7", "MiniMax M2.7", "text", "文本、编码与工具调用", "chat-completions", "/v1/chat/completions"),
      nativeModel("minimax", "image-01", "MiniMax Image 01", "image", "文生图与主体参考", "native-http", "/v1/image_generation"),
      nativeModel("minimax", "speech-2.8-hd", "MiniMax Speech 2.8 HD", "audio", "高质量语音合成", "native-http", "/v1/t2a_v2"),
      nativeModel("minimax", "MiniMax-Hailuo-2.3", "Hailuo 2.3", "video", "文本/图片生成视频", "native-http", "/v1/video_generation", "/v1/query/video_generation?task_id={taskId}"),
    ],
  }),
  openAiCompatible("dashscope", "阿里云百炼", "千问、万相、Wan 及百炼模型市场官方入口。", "cloud", "https://dashscope.aliyuncs.com/compatible-mode", "https://help.aliyun.com/zh/model-studio", ["qwen3.6-plus", "qwen3-max"], ["llm", "image", "audio", "video"]),
  openAiCompatible("volcengine-ark", "火山方舟", "豆包、Seedream、Seedance 与语音模型官方云入口。", "cloud", "https://ark.cn-beijing.volces.com/api", "https://www.volcengine.com/docs/82379", ["doubao-seed-2-0-pro", "doubao-seed-2-0-lite"], ["llm", "image", "audio", "video"]),
  provider({
    id: "tencent-hunyuan",
    name: "腾讯混元",
    description: "腾讯云混元文本、图像与视频服务，使用 SecretId/SecretKey 签名。",
    kind: "cloud",
    support: "configuration",
    modalities: ["llm", "image", "video"],
    docsUrl: "https://cloud.tencent.com/document/product/1729",
    defaultBaseUrl: "https://hunyuan.tencentcloudapi.com",
    authType: "multi-field",
    credentialFields: [field("secretId", "SecretId", { secret: true }), field("secretKey", "SecretKey", { secret: true }), field("region", "地域", { secret: false, placeholder: "ap-guangzhou" })],
  }),
  provider({
    id: "baidu-qianfan",
    name: "百度千帆",
    description: "百度智能云千帆文本与图像模型平台。",
    kind: "cloud",
    support: "configuration",
    modalities: ["llm", "image"],
    docsUrl: "https://cloud.baidu.com/doc/WENXINWORKSHOP/index.html",
    defaultBaseUrl: "https://qianfan.baidubce.com",
    authType: "multi-field",
    credentialFields: [field("apiKey", "API Key", { secret: true }), field("secretKey", "Secret Key", { secret: true })],
  }),
  provider({
    id: "azure-ai",
    name: "Azure AI Foundry",
    description: "Azure OpenAI 与模型目录，按资源端点和部署名配置。",
    kind: "cloud",
    support: "configuration",
    modalities: ["llm", "image", "audio", "video"],
    docsUrl: "https://learn.microsoft.com/azure/ai-foundry/",
    defaultBaseUrl: "https://YOUR-RESOURCE.openai.azure.com",
    authType: "api-key-header",
    authHeader: "api-key",
    credentialFields: [apiKey, field("deployment", "部署名称", { secret: false }), field("apiVersion", "API 版本", { secret: false, placeholder: "2025-04-01-preview" })],
  }),
  provider({
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    description: "AWS Bedrock 多厂商模型目录，使用 IAM SigV4。",
    kind: "cloud",
    support: "configuration",
    modalities: ["llm", "image", "audio", "video"],
    docsUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html",
    defaultBaseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    authType: "multi-field",
    credentialFields: [field("accessKeyId", "Access Key ID", { secret: true }), field("secretAccessKey", "Secret Access Key", { secret: true }), field("region", "Region", { secret: false, placeholder: "us-east-1" }), field("sessionToken", "Session Token（可选）", { secret: true, required: false })],
  }),
  provider({
    id: "stability",
    name: "Stability AI",
    description: "Stable Image 与 Stable Audio 官方 API。",
    kind: "official",
    support: "native",
    modalities: ["image", "audio"],
    docsUrl: "https://platform.stability.ai/docs/api-reference",
    defaultBaseUrl: "https://api.stability.ai",
    authType: "bearer",
    testPath: "/v1/engines/list",
    models: [nativeModel("stability", "stable-image-ultra", "Stable Image Ultra", "image", "高质量图像生成", "native-http", "/v2beta/stable-image/generate/ultra")],
  }),
  provider({
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "语音合成、音色、转写与声音效果官方平台。",
    kind: "official",
    support: "native",
    modalities: ["audio"],
    docsUrl: "https://elevenlabs.io/docs/api-reference/introduction",
    defaultBaseUrl: "https://api.elevenlabs.io",
    authType: "x-api-key",
    authHeader: "xi-api-key",
    testPath: "/v1/user",
    models: [nativeModel("elevenlabs", "eleven_multilingual_v2", "Eleven Multilingual v2", "audio", "多语言语音合成", "native-http", "/v1/text-to-speech/{voiceId}")],
  }),
  provider({
    id: "deepgram",
    name: "Deepgram",
    description: "官方语音识别与 Aura 语音合成。",
    kind: "official",
    support: "native",
    modalities: ["audio"],
    docsUrl: "https://developers.deepgram.com/reference",
    defaultBaseUrl: "https://api.deepgram.com",
    authType: "api-key-header",
    authHeader: "Authorization",
    extraHeaders: { "X-AIYOU-Auth-Prefix": "Token" },
    testPath: "/v1/projects",
    models: [nativeModel("deepgram", "aura-2", "Deepgram Aura 2", "audio", "低延迟语音合成", "native-http", "/v1/speak?model={model}")],
  }),
  provider({
    id: "runway",
    name: "Runway",
    description: "Runway 官方视频与图像生成 API。",
    kind: "official",
    support: "native",
    modalities: ["image", "video"],
    docsUrl: "https://docs.dev.runwayml.com/api/",
    defaultBaseUrl: "https://api.dev.runwayml.com",
    authType: "bearer",
    extraHeaders: { "X-Runway-Version": "2024-11-06" },
    models: [nativeModel("runway", "gen4.5", "Runway Gen-4.5", "video", "文本/图片生成视频", "native-http", "/v1/text_to_video", "/v1/tasks/{taskId}")],
  }),
  provider({
    id: "luma",
    name: "Luma AI",
    description: "Dream Machine 官方图片与视频 API。",
    kind: "official",
    support: "native",
    modalities: ["image", "video"],
    docsUrl: "https://docs.lumalabs.ai/docs/api",
    defaultBaseUrl: "https://api.lumalabs.ai",
    authType: "bearer",
    models: [nativeModel("luma", "ray-2", "Luma Ray 2", "video", "文本/图片生成视频", "native-http", "/dream-machine/v1/generations/video", "/dream-machine/v1/generations/{taskId}")],
  }),
  provider({
    id: "kling",
    name: "可灵 Kling AI",
    description: "可灵官方图像与视频生成 API，使用 AccessKey/SecretKey。",
    kind: "official",
    support: "configuration",
    modalities: ["image", "video"],
    docsUrl: "https://app.klingai.com/global/dev/document-api/quickStart/productIntroduction/overview",
    defaultBaseUrl: "https://api-beijing.klingai.com",
    authType: "multi-field",
    credentialFields: [field("accessKey", "Access Key", { secret: true }), field("secretKey", "Secret Key", { secret: true })],
    models: [nativeModel("kling", "kling-v3", "Kling V3", "video", "文生/图生视频", "native-http", "/v1/videos/text2video", "/v1/videos/text2video/{taskId}")],
  }),
  provider({
    id: "vidu",
    name: "Vidu",
    description: "Vidu 官方图像与视频生成开放平台。",
    kind: "official",
    support: "native",
    modalities: ["image", "video"],
    docsUrl: "https://platform.vidu.com/docs",
    defaultBaseUrl: "https://api.vidu.com",
    authType: "bearer",
    models: [nativeModel("vidu", "vidu-q3", "Vidu Q3", "video", "参考生视频与高一致性", "native-http", "/ent/v2/img2video", "/ent/v2/tasks/{taskId}/creations")],
  }),
  provider({
    id: "bfl",
    name: "Black Forest Labs",
    description: "FLUX 官方图像生成与编辑 API。",
    kind: "official",
    support: "native",
    modalities: ["image"],
    docsUrl: "https://docs.bfl.ai/",
    defaultBaseUrl: "https://api.bfl.ai",
    authType: "x-api-key",
    authHeader: "x-key",
    models: [nativeModel("bfl", "flux-pro-1.1-ultra", "FLUX 1.1 Pro Ultra", "image", "高质量图像生成", "native-http", "/v1/flux-pro-1.1-ultra", "/v1/get_result?id={taskId}")],
  }),
  provider({
    id: "recraft",
    name: "Recraft",
    description: "Recraft 官方位图、矢量图与风格化生成 API。",
    kind: "official",
    support: "native",
    modalities: ["image"],
    docsUrl: "https://www.recraft.ai/docs",
    defaultBaseUrl: "https://external.api.recraft.ai",
    authType: "bearer",
    models: [nativeModel("recraft", "recraftv3", "Recraft V3", "image", "位图与矢量图生成", "native-http", "/v1/images/generations")],
  }),
  openAiCompatible("groq", "GroqCloud", "Groq 官方高速推理云。", "cloud", "https://api.groq.com/openai", "https://console.groq.com/docs", ["llama-3.3-70b-versatile"]),
  openAiCompatible("openrouter", "OpenRouter", "聚合多家公开模型的统一路由平台。", "aggregator", "https://openrouter.ai/api", "https://openrouter.ai/docs/api/reference/overview", ["openai/gpt-5.6", "anthropic/claude-opus-5"]),
  openAiCompatible("siliconflow", "SiliconFlow", "硅基流动多模态模型云平台。", "aggregator", "https://api.siliconflow.cn", "https://docs.siliconflow.cn", ["deepseek-ai/DeepSeek-V4", "Qwen/Qwen3.5-397B-A17B"], ["llm", "image", "audio", "video"]),
  provider({
    id: "custom-openai",
    name: "自定义 OpenAI 兼容",
    description: "用于私有部署、LocalAI、Ollama 网关或尚未内置的平台。",
    kind: "compatible",
    support: "native",
    modalities: ["llm"],
    docsUrl: "https://platform.openai.com/docs/api-reference",
    defaultBaseUrl: "http://127.0.0.1:11434",
    authType: "bearer",
    credentialFields: [
      { ...apiKey, required: false },
      field("modelIds", "自定义模型 ID（逗号或换行分隔）", { required: false, secret: false, help: "用于未提供 /v1/models 的私有部署；可填写多个模型。" }),
    ],
    testPath: "/v1/models",
    modelListPath: "/v1/models",
    modelListShape: "data",
    models: [nativeModel("custom-openai", "custom-model", "自定义模型", "text", "OpenAI Chat Completions 兼容模型", "chat-completions", "/v1/chat/completions")],
  }),
];

for (const definition of PROVIDER_CATALOG) {
  for (const model of definition.models) {
    model.providerId = definition.id;
    model.providerName = definition.name;
    model.providerKind = definition.kind;
    model.support = definition.support;
  }
}

export const PROVIDER_BY_ID = new Map(PROVIDER_CATALOG.map((item) => [item.id, item]));

export function providerForModel(modelId: string) {
  if (!modelId.includes(MODEL_ID_SEPARATOR)) return PROVIDER_BY_ID.get("ai-task-mcp");
  return PROVIDER_BY_ID.get(modelId.split(MODEL_ID_SEPARATOR, 1)[0]);
}

export function getProviderModel(modelId: string) {
  const providerDefinition = providerForModel(modelId);
  return providerDefinition?.models.find((model) => model.id === modelId || model.nativeModelId === modelId);
}

export function allProviderModels() {
  return PROVIDER_CATALOG.flatMap((item) => item.models);
}

const STREAMING_CONVERSATION_PROTOCOLS = new Set<ModelDefinition["protocol"]>([
  "chat-completions",
  "responses",
  "anthropic-messages",
  "gemini-generate",
]);

/** Models allowed in the conversation composer must support incremental text output. */
export function isStreamingConversationModel(model: ModelDefinition) {
  return model.category === "text" && STREAMING_CONVERSATION_PROTOCOLS.has(model.protocol);
}

export function generationModels(models: ModelDefinition[]) {
  return models.filter((model) => !isStreamingConversationModel(model));
}

export function providerCoverage() {
  const modalities: Record<ProviderModality, number> = { llm: 0, image: 0, audio: 0, video: 0 };
  for (const item of PROVIDER_CATALOG) for (const modality of item.modalities) modalities[modality] += 1;
  return {
    providers: PROVIDER_CATALOG.length,
    officialOrCloud: PROVIDER_CATALOG.filter((item) => item.kind === "official" || item.kind === "cloud").length,
    native: PROVIDER_CATALOG.filter((item) => item.support === "native").length,
    seededModels: allProviderModels().length,
    modalities,
  };
}

export function categoryToModality(category: ModelCategory): ProviderModality | null {
  if (category === "text") return "llm";
  if (category === "processing") return "video";
  return category;
}

export function supportLabel(support: ProviderSupport) {
  return support === "native" ? "原生接入" : "凭证配置";
}
