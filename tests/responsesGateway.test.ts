import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderClient } from "../src/main/providerClient";
import { ResponsesGateway } from "../src/main/responsesGateway";

const running: ResponsesGateway[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((gateway) => gateway.stop()));
});

describe("AIYOU Responses gateway", () => {
  it("converts a third-party stream into ordered Responses events for Codex", async () => {
    const encoder = new TextEncoder();
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"检查工具"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"完成"}}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const provider = {
      openAgentResponse: vi.fn(async () => ({
        response: new Response(upstream, { status: 200, headers: { "content-type": "text/event-stream" } }),
        protocol: "chat-completions" as const,
        nativeModelId: "model-x",
        model: { id: "custom-openai::model-x", name: "model-x", category: "text", capability: "test", submitPath: "/v1/chat/completions", protocol: "chat-completions" as const },
      })),
    } as unknown as ProviderClient;
    const gateway = new ResponsesGateway(provider);
    running.push(gateway);
    const baseUrl = await gateway.start();
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "custom-openai::model-x", stream: true, input: "执行任务" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-aiyou-agent-runtime")).toBe("codex-app-server");
    const payloads = (await response.text()).split(/\n/)
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
    const added = payloads.filter((event) => event.type === "response.output_item.added");
    expect(added.map((event) => event.output_index)).toEqual([0, 1]);
    expect(payloads.find((event) => event.type === "response.reasoning_summary_text.delta")?.delta).toBe("检查工具");
    expect(payloads.find((event) => event.type === "response.output_text.delta")?.delta).toBe("完成");
    const completed = payloads.find((event) => event.type === "response.completed")?.response as Record<string, unknown>;
    expect((completed.output as Array<Record<string, unknown>>).map((item) => item.type)).toEqual(["reasoning", "message"]);
  });

  it("normalizes upstream failures into a safe Responses terminal event", async () => {
    const provider = {
      openAgentResponse: vi.fn(async () => ({
        response: new Response("Aliyun Bailian upstream connection failed, url: http://127.0.0.1:61149/v1/responses", { status: 502 }),
        protocol: "chat-completions" as const,
        nativeModelId: "deepseek-v4-pro",
        model: {
          id: "deepseek-v4-pro",
          name: "DeepSeek v4 Pro（百炼）",
          category: "text",
          capability: "test",
          submitPath: "/v1/chat/completions",
          protocol: "chat-completions" as const,
          providerId: "ai-task-mcp",
          providerName: "AI Task MCP",
        },
      })),
    } as unknown as ProviderClient;
    const gateway = new ResponsesGateway(provider);
    running.push(gateway);
    const baseUrl = await gateway.start();
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "deepseek-v4-pro", stream: true, input: "执行任务" }),
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("response.failed");
    expect(text).toContain("HTTP 502");
    expect(text).toContain("上游服务暂时不可用");
    expect(text).toContain("阿里云百炼上游连接失败");
    expect(text).not.toContain("127.0.0.1");
    expect(text).not.toContain("localhost");
  });

  it("closes a mid-stream provider error with a sanitized failed event", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"error":{"message":"Aliyun Bailian upstream connection failed, url: http://127.0.0.1:61149/v1/responses"}}\n\n'));
        controller.close();
      },
    });
    const provider = {
      openAgentResponse: vi.fn(async () => ({
        response: new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }),
        protocol: "chat-completions" as const,
        nativeModelId: "deepseek-v4-pro",
        model: { id: "deepseek-v4-pro", name: "DeepSeek v4 Pro（百炼）", category: "text", capability: "test", submitPath: "/v1/chat/completions", protocol: "chat-completions" as const },
      })),
    } as unknown as ProviderClient;
    const gateway = new ResponsesGateway(provider);
    running.push(gateway);
    const baseUrl = await gateway.start();
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "deepseek-v4-pro", stream: true, input: "执行任务" }),
    });
    const text = await response.text();
    expect(text).toContain("response.failed");
    expect(text).toContain("阿里云百炼上游连接失败");
    expect(text).not.toContain("127.0.0.1");
  });
});
