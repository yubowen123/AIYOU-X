import { describe, expect, it } from "vitest";
import {
  resolveStatusPath,
  resolveSubmitRequest,
  sanitizePayload,
} from "../src/shared/requestRouter";

describe("AI Task request routing", () => {
  it("routes ordinary video generation", () => {
    const request = resolveSubmitRequest("seedance-2.5", {
      prompt: "test",
      userId: 1,
      empty: "",
    });
    expect(request.path).toBe("/api/v1/video/generate");
    expect(request.body.model).toBe("seedance-2.5");
    expect(request.body).not.toHaveProperty("empty");
  });

  it("translates model routed video requests", () => {
    const request = resolveSubmitRequest("seedance-2.5", { prompt: "test" }, true);
    expect(request.path).toBe("/api/v1/model-route/video/generate");
    expect(request.body.modelName).toBe("seedance-2.5");
    expect(request.body).not.toHaveProperty("model");
    expect(resolveStatusPath("seedance-2.5", "abc/123", true)).toBe(
      "/api/v1/model-route/video/status/abc%2F123",
    );
  });

  it("routes audio clone separately from tts", () => {
    const request = resolveSubmitRequest("MiniMax/speech-2.8-hd", {
      operation: "clone",
      text: "hello",
    });
    expect(request.path).toBe("/api/v1/audio/voice/clone");
    expect(request.body).not.toHaveProperty("operation");
    expect(resolveStatusPath("MiniMax/speech-2.8-hd", "voice-1", false, "clone")).toBe(
      "/api/v1/audio/voice/clone/status/voice-1",
    );
  });

  it("normalizes Responses requests for Codex-compatible models", () => {
    const request = resolveSubmitRequest("qwen3.7-plus", {
      question: "hello",
      stream: false,
    });
    expect(request.path).toBe("/v1/responses");
    expect(request.body.input).toBe("hello");
    expect(request.body.model).toBe("qwen3.7-plus");
    expect(request.body).not.toHaveProperty("question");
  });

  it("normalizes Chat Completions requests", () => {
    const request = resolveSubmitRequest("gemini-3.1-pro-preview", { question: "hello" });
    expect(request.path).toBe("/v1/chat/completions");
    expect(request.body.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("drops only empty values", () => {
    expect(sanitizePayload({ a: "", b: 0, c: false, d: [], e: [1], f: null })).toEqual({
      b: 0,
      c: false,
      e: [1],
    });
  });
});
