import { describe, expect, it } from "vitest";
import {
  AI_TASK_DOCS,
  MODEL_CATALOG,
  VIDEO_ROUTE_IDS,
  catalogCounts,
} from "../src/shared/modelCatalog";

describe("AI Task MCP model catalog", () => {
  it("covers every model listed in docs v3.3", () => {
    expect(MODEL_CATALOG).toHaveLength(76);
    expect(catalogCounts()).toEqual({
      video: 31,
      image: 19,
      text: 12,
      audio: 5,
      processing: 9,
    });
  });

  it("has no duplicate public model ids", () => {
    const ids = MODEL_CATALOG.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares a callable endpoint and protocol for every model", () => {
    for (const model of MODEL_CATALOG) {
      expect(model.submitPath).toMatch(/^\//);
      expect(["async-http", "chat-completions", "responses"]).toContain(model.protocol);
      if (model.protocol === "async-http") expect(model.statusPath).toContain("{taskId}");
    }
  });

  it("exposes all eight documented video route ids", () => {
    expect(VIDEO_ROUTE_IDS).toHaveLength(8);
    expect(VIDEO_ROUTE_IDS).toContain("seedance-2.5");
    expect(VIDEO_ROUTE_IDS).toContain("dreamina-2.5");
  });

  it("pins the source boundary", () => {
    expect(AI_TASK_DOCS.version).toBe("3.3");
    expect(AI_TASK_DOCS.source).toBe("https://ai-mcp.wuread.cn/docs.html#models");
  });

  it("uses the stable Chat transport for Bailian DeepSeek Agent turns", () => {
    expect(MODEL_CATALOG.find((model) => model.id === "deepseek-v4-pro")).toMatchObject({
      protocol: "chat-completions",
      submitPath: "/v1/chat/completions",
      agentCapable: true,
    });
  });
});
