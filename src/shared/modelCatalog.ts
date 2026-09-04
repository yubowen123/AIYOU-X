import type { ModelDefinition, ModelCategory } from "./types";

export const AI_TASK_DOCS = {
  version: "3.3",
  source: "https://ai-mcp.wuread.cn/docs.html#models",
  capturedAt: "2026-08-28",
} as const;

const asyncModel = (
  id: string,
  name: string,
  category: ModelCategory,
  capability: string,
  submitPath: string,
  statusPath: string,
  duration?: string,
): ModelDefinition => ({
  id,
  name,
  category,
  capability,
  submitPath,
  statusPath,
  protocol: "async-http",
  duration,
});

const video = (
  id: string,
  name: string,
  capability: string,
  duration: string,
) =>
  asyncModel(
    id,
    name,
    "video",
    capability,
    "/api/v1/video/generate",
    "/api/v1/video/status/{taskId}",
    duration,
  );

const image = (id: string, name: string, capability: string) =>
  asyncModel(
    id,
    name,
    "image",
    capability,
    "/api/v1/image/generate",
    "/api/v1/image/status/{taskId}",
  );

const legacyText = (id: string, name: string, capability: string) =>
  asyncModel(
    id,
    name,
    "text",
    capability,
    "/api/v1/llm/generate",
    "/api/v1/llm/status/{taskId}",
  );

const standardText = (
  id: string,
  name: string,
  capability: string,
  protocol: "chat-completions" | "responses",
  agentCapable = false,
): ModelDefinition => ({
  id,
  name,
  category: "text",
  capability,
  submitPath: protocol === "responses" ? "/v1/responses" : "/v1/chat/completions",
  protocol,
  agentCapable,
});

export const MODEL_CATALOG: ModelDefinition[] = [
  video("seedance", "Seedance 2.0", "文生 / 图生 / 首尾帧 / 多模态参考", "4~15s"),
  video("seedance-fast", "Seedance 2.0 Fast", "文生 / 图生（快速）", "4~15s"),
  video("seedance-2.0-mini", "Seedance 2.0 Mini", "文生 / 图生 / 首尾帧 / 多模态参考（480p/720p）", "4~15s 或 -1"),
  video("seedance-2.5", "Seedance 2.5（国内）", "文生 / 首尾帧 / 30图·10视频·10音频参考 / 纯音频 / mp4·mov", "4~30s 或 -1"),
  video("yunduan-seedance-2.0", "云端 Seedance 2.0（国内）", "文生 / 图生 / 多模态参考 / 素材预审核（最高1080p）", "4~15s 或 -1"),
  video("pake-seedance-2.0", "帕科 Seedance 2.0", "文生 / 图生 / 多模态参考 / 媒体自动登记", "4~15s 或 -1"),
  video("pake-seedance-2.0-fast", "帕科 Seedance 2.0 Fast", "快速版 / asset 引用", "4~15s 或 -1"),
  video("pake-seedance-2.0-mini", "帕科 Seedance 2.0 Mini", "文生 / 图生 / 多模态参考（480p/720p）", "4~15s 或 -1"),
  video("pake-seedance-2.5", "帕科 Seedance 2.5", "2.5 专用 / 首尾帧 / 返回尾帧 / mp4·mov", "4~30s 或 -1"),
  video("wan3.0", "Wan 3.0 All-in-One", "文生 / 首尾帧 / 图片·视频·音频·文件·链接参考", "2~30s 或 -1"),
  video("wan3.0-prime", "Wan 3.0 All-in-One Prime", "Wan 3.0 高速通道 / 全模态输入", "2~30s 或 -1"),
  video("dreamina", "Dreamina 2.0（海外）", "文生 / 图生 / 首尾帧 / 多模态", "4~15s"),
  video("dreamina-fast", "Dreamina 2.0 Fast（海外）", "文生 / 图生（快速）", "4~15s"),
  video("dreamina-mini", "Dreamina 2.0 Mini（海外）", "文生 / 图生 / 首尾帧 / 多模态（480p/720p）", "4~15s 或 -1"),
  video("MiniMax-H3", "MiniMax H3", "文生 / 首尾帧 / 图片·视频·音频参考（768P/2K）", "4~15s"),
  video("MiniMax-H3-Overseas", "MiniMax H3 Overseas", "海外端点 / 首尾帧 / 多模态（768P/2K）", "4~15s"),
  video("dreamina-2.5", "Dreamina 2.5（海外）", "文生 / 首尾帧 / 30图·10视频·10音频参考 / 纯音频", "4~30s 或 -1"),
  video("nova-video-2.0", "Nova Video 2.0", "文生 / 图生 / 首尾帧 / 多模态（最高1080p）", "4~15s 或 -1"),
  video("nova-video-2.0-fast", "Nova Video 2.0 Fast", "文生 / 图生 / 多模态快速版（480p/720p）", "4~15s 或 -1"),
  video("nova-video-2.0-mini", "Nova Video 2.0 Mini", "文生 / 图生 / 多模态轻量版（480p/720p）", "4~15s 或 -1"),
  video("vidu", "Vidu Q1/Q2", "图生 / 参考生视频（高一致性）", "1~10s"),
  video("vidu-q3", "Vidu Q3", "图生 / 参考生视频（最高1080p）", "1~16s"),
  video("kling", "可灵 O1", "图生视频 / 运动增强", "5~10s"),
  video("kling-o3", "可灵 O3", "图生视频 / 理解增强", "5~10s"),
  video("hh1.1-t2v", "HH1.1 文生视频", "文生视频 / seed / watermark", "3~15s"),
  video("hh1.1-i2v", "HH1.1 图生视频", "图生视频 / 图片决定比例", "3~15s"),
  video("hh1.1-r2v", "HH1.1 参考生视频", "1~9 张参考图生视频", "3~15s"),
  video("hh1-t2v", "HH1 文生视频", "文生视频 / seed / watermark", "3~15s"),
  video("hh1-i2v", "HH1 图生视频", "图生视频 / 图片决定比例", "3~15s"),
  video("hh1-r2v", "HH1 参考生视频", "1~9 张参考图生视频", "3~15s"),
  video("hh1-video-edit", "HH1 视频编辑", "视频重绘 / 编辑 / 原音控制", "由源视频决定"),

  image("seedream-4.5", "Doubao Seedream 4.5（国内）", "文生图 / 图生图 / 最多14张参考图"),
  image("seedream-5-lite", "即梦生图 5.0 Lite", "文生图 / 图生图 / 最多14张参考图"),
  image("dola-seedream-5-lite", "Dola Seedream 5.0 Lite（海外）", "文生图 / 图生图 / 最多14张参考图"),
  image("seedream-5-pro", "Seedream 5.0 Pro", "文生图 / 图生图 / 最多10张参考图"),
  image("dola-seedream-5-pro", "Dola Seedream 5.0 Pro（海外）", "文生图 / 图生图 / 最多10张参考图"),
  image("dola-seedream-4.0", "Dola Seedream 4.0（海外）", "文生图 / 图生图 / 最多14张参考图"),
  image("jimeng-4.0", "即梦生图 4.0（国内）", "文生图 / 图生图 / 最多10张参考图"),
  image("ali-mj-v7", "AliMJ V7", "文生图"),
  image("ali-mj-niji7", "AliMJ NIJI 7", "二次元文生图"),
  image("ali-mj-v8.1", "AliMJ V8.1", "文生图 / 图生图 / 1K·2K·4K"),
  image("ali-mj-v8.2-preview", "AliMJ V8.2 Preview", "文生图 / 图生图 / 1K·2K"),
  image("ali-mj-v8.2", "AliMJ V8.2 正式版", "文生图 / 图生图 / 最多20张参考图"),
  image("canvas-20", "Canvas 2.0", "文生图 / 图生图 / 最多16张参考图"),
  image("g3.1-flash-image-preview", "MiniMax Banana 2", "文生图 / 图生图"),
  image("g3-pro-image-preview", "MiniMax Banana Pro", "文生图 / 图生图"),
  image("gpt-image-2", "GPT Image 2", "文生图 / 图生图"),
  image("gpt-image-2-high", "GPT Image 2 High", "腾讯 VOD 高质量文生图 / 图生图 / 最多16张参考图"),
  image("vidu/vidu-image_reference2image", "Vidu Image", "阿里百炼直连 / 文生图 / 最多14张参考图"),
  image("vidu/vidu-image-pro_reference2image", "Vidu Image Pro", "阿里百炼直连 / 高质量参考图生图"),

  legacyText("doubao-seed-2.0", "豆包 Seed 2.0 Pro", "纯文本单轮 / 多轮 / system prompt"),
  legacyText("doubao-seed-2.0-lite", "豆包 Seed 2.0 Lite", "图片·视频·文件·音频多模态对话"),
  legacyText("gemini-3.0-flash-preview", "Gemini 3.0 Flash Preview", "多轮多模态 / 思考强度"),
  standardText("gemini-3.1-pro-preview", "Gemini 3.1 Pro（七牛）", "标准 Chat Completions / 多模态 / SSE", "chat-completions"),
  legacyText("openai/gpt-5.4", "GPT 5.4", "历史异步单轮文本"),
  legacyText("openai/gpt-5.5", "GPT 5.5（历史七牛通道）", "历史异步单轮文本"),
  standardText("openai/gpt-5.5-cache", "GPT 5.5 Cache（七牛）", "Chat Completions / Prompt Cache / Function Calling / SSE", "chat-completions"),
  standardText("tokenlab/gpt-5.5", "GPT 5.5（TokenLab）", "Chat Completions + Responses / 工具调用 / SSE", "responses", true),
  legacyText("qwen3.6-plus", "Qwen 3.6 Plus", "多轮图像·视频输入 / 思考 / JSON Mode"),
  standardText("qwen3.7-plus", "Qwen 3.7 Plus", "Chat Completions + Responses / Function Calling / SSE", "responses", true),
  standardText("deepseek-v4-pro", "DeepSeek v4 Pro（百炼）", "Chat Completions + Responses / 工具调用 / SSE", "chat-completions", true),
  legacyText("deepseek-v4-flash", "DeepSeek v4 Flash", "纯文本单轮 / 多轮"),

  asyncModel("bd-voice-clone-tts", "豆包音色复刻 + TTS", "audio", "参考音频复刻 + 中英日文本合成", "/api/v1/audio/tts", "/api/v1/audio/tts/status/{taskId}"),
  asyncModel("seed-tts-2.0", "火山豆包语音合成 2.0", "audio", "公版音色异步长文本 TTS", "/api/v1/audio/tts", "/api/v1/audio/tts/status/{taskId}"),
  asyncModel("seed-icl-2.0", "火山声音复刻 2.0", "audio", "声音训练 + 复刻音色异步长文本 TTS", "/api/v1/audio/tts", "/api/v1/audio/tts/status/{taskId}"),
  asyncModel("MiniMax/speech-2.8-hd", "MiniMax Speech 2.8 HD", "audio", "声音复刻 + 非流式高质量 TTS", "/api/v1/audio/tts", "/api/v1/audio/tts/status/{taskId}"),
  asyncModel("MiniMax/speech-2.8-turbo", "MiniMax Speech 2.8 Turbo", "audio", "声音复刻 + 非流式快速 TTS", "/api/v1/audio/tts", "/api/v1/audio/tts/status/{taskId}"),

  asyncModel("vod-enhance", "腾讯 VOD 超分增强", "processing", "720P / 1080P / 2K / 4K；通用·漫剧·真人·Seedance", "/api/v1/video/enhance", "/api/v1/video/enhance/status/{taskId}"),
  asyncModel("aliyun-video-super-resolution", "阿里云 MPS 视频超分", "processing", "1080P / 2K / 4K", "/api/v1/video/enhance", "/api/v1/video/enhance/status/{taskId}"),
  asyncModel("volcengine-video-enhance-llm", "MediaKit 画质增强（大模型版）", "processing", "异步画质增强 / 720P·1080P·2K", "/api/v1/video/enhance", "/api/v1/video/enhance/status/{taskId}"),
  asyncModel("volcengine-video-enhance-standard", "MediaKit 画质增强（标准版）", "processing", "通用·UGC·短剧·AIGC·老片修复", "/api/v1/video/enhance", "/api/v1/video/enhance/status/{taskId}"),
  asyncModel("volcengine-video-enhance-professional", "MediaKit 画质增强（专业版）", "processing", "增强风格 / 分辨率 / 帧率 / 码率 / 位深", "/api/v1/video/enhance", "/api/v1/video/enhance/status/{taskId}"),
  asyncModel("video-detext", "阿里云视频字幕擦除", "processing", "自动检测 / 自定义区域和时间段", "/api/v1/video/detext", "/api/v1/video/detext/status/{taskId}"),
  asyncModel("ark-subtitle-erase", "火山方舟字幕擦除（免费版）", "processing", "火山方舟原始视频 URL / 24小时有效", "/api/v1/video/subtitle-erase/ark", "/api/v1/video/subtitle-erase/ark/status/{taskId}"),
  asyncModel("mediakit-subtitle-erase-pro", "MediaKit 字幕擦除（精细化版）", "processing", "字幕 / 全文本 / 指定区域擦除", "/api/v1/video/subtitle-erase/mediakit-pro", "/api/v1/video/subtitle-erase/mediakit-pro/status/{taskId}"),
  asyncModel("mediakit-subtitle-erase-standard", "MediaKit 字幕擦除（标准版）", "processing", "智能自动检测和字幕擦除", "/api/v1/video/subtitle-erase/mediakit-standard", "/api/v1/video/subtitle-erase/mediakit-standard/status/{taskId}"),
];

export const VIDEO_ROUTE_IDS = [
  "seedance-2.0",
  "seedance-2.0-fast",
  "seedance-2.0-mini",
  "seedance-2.5",
  "dreamina-2.0",
  "dreamina-2.0-fast",
  "dreamina-2.0-mini",
  "dreamina-2.5",
] as const;

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  text: "文本 / 多模态",
  video: "视频生成",
  image: "图片生成",
  audio: "音频合成",
  processing: "视频增强 / 处理",
};

export function getModel(modelId: string) {
  return MODEL_CATALOG.find((model) => model.id === modelId);
}

export function catalogCounts() {
  return MODEL_CATALOG.reduce<Record<ModelCategory, number>>(
    (counts, model) => {
      counts[model.category] += 1;
      return counts;
    },
    { video: 0, image: 0, text: 0, audio: 0, processing: 0 },
  );
}
