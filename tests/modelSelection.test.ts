import { describe, expect, it } from "vitest";
import { allProviderModels, isStreamingConversationModel } from "../src/shared/providerCatalog";
import { explicitlyRequestedModel, requestedGenerationCategory } from "../src/shared/modelSelection";

describe("model selection and routing", () => {
  const models = allProviderModels();

  it("allows only streaming text protocols in the chat selector", () => {
    const chatModels = models.filter(isStreamingConversationModel);
    expect(chatModels.length).toBeGreaterThan(0);
    expect(chatModels.every((model) => model.category === "text")).toBe(true);
    expect(chatModels.every((model) => ["chat-completions", "responses", "anthropic-messages", "gemini-generate"].includes(model.protocol))).toBe(true);
    expect(chatModels.some((model) => model.category === "video" || model.category === "image" || model.category === "audio")).toBe(false);
  });

  it("routes explicit model names before category defaults", () => {
    expect(explicitlyRequestedModel("请使用 Seedance 2.5（国内）生成视频", models)?.id).toBe("seedance-2.5");
    expect(requestedGenerationCategory("请生成一段 10 秒视频")).toBe("video");
    expect(requestedGenerationCategory("帮我写一个视频提示词")).toBeUndefined();
  });
});
