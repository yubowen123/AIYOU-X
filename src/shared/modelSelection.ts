import { isStreamingConversationModel } from "./providerCatalog";
import type { AppSettings, ModelCategory, ModelDefinition } from "./types";

export function modelsForDefaultCategory(models: ModelDefinition[], category: ModelCategory) {
  return category === "text"
    ? models.filter(isStreamingConversationModel)
    : models.filter((model) => model.category === category);
}

export function defaultModelId(
  settings: AppSettings,
  models: ModelDefinition[],
  category: ModelCategory,
) {
  const preferred = settings.defaultModels[category];
  if (category === "text" && preferred === "codex") return "codex";
  const available = modelsForDefaultCategory(models, category);
  return available.some((model) => model.id === preferred) ? preferred : available[0]?.id ?? (category === "text" ? "codex" : "");
}

/** A prompt may explicitly name a model; longest exact name/id match wins. */
export function explicitlyRequestedModel(prompt: string, models: ModelDefinition[]) {
  const value = prompt.toLocaleLowerCase();
  return models
    .flatMap((model) => [model.name, model.nativeModelId, model.id]
      .filter((alias): alias is string => Boolean(alias && alias.length >= 4))
      .map((alias) => ({ model, alias: alias.toLocaleLowerCase() })))
    .filter(({ alias }) => value.includes(alias))
    .sort((a, b) => b.alias.length - a.alias.length)[0]?.model;
}

export function requestedGenerationCategory(prompt: string): Exclude<ModelCategory, "text"> | undefined {
  const value = prompt.toLocaleLowerCase();
  if (!/(生成|制作|创建|绘制|合成|复刻|增强|擦除|修复|generate|create|make|enhance)/i.test(value)) return undefined;
  if (/(超分|字幕擦除|去字幕|画质增强|修复|enhance|upscale)/i.test(value)) return "processing";
  if (/(视频|短片|动画|video|movie)/i.test(value)) return "video";
  if (/(音频|语音|配音|音色|声音|tts|audio|voice)/i.test(value)) return "audio";
  if (/(图片|图像|海报|插画|照片|image|poster)/i.test(value)) return "image";
  return undefined;
}
