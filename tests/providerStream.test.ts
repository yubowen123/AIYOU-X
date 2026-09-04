import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProviderClient,
  consumeAgentStream,
  consumeTextStream,
  extractStreamDelta,
  extractStreamReasoning,
  responsesInputToChatMessages,
  responsesToolsToChatTools,
} from "../src/main/providerClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider text streaming", () => {
  it("extracts incremental answer text for every supported conversation protocol", () => {
    expect(extractStreamDelta({ choices: [{ delta: { content: "OpenAI" } }] })).toBe("OpenAI");
    expect(extractStreamDelta({ type: "response.output_text.delta", delta: " Responses" })).toBe(" Responses");
    expect(extractStreamDelta({ delta: { type: "text_delta", text: " Claude" } })).toBe(" Claude");
    expect(extractStreamDelta({ candidates: [{ content: { parts: [{ text: " Gemini" }] } }] })).toBe(" Gemini");
  });

  it("shows only reasoning text explicitly returned by the provider", () => {
    expect(extractStreamReasoning({ type: "response.reasoning_summary_text.delta", delta: "检查约束" })).toBe("检查约束");
    expect(extractStreamReasoning({ choices: [{ delta: { reasoning_content: "比较方案" } }] })).toBe("比较方案");
    expect(extractStreamReasoning({ choices: [{ delta: { content: "普通回答" } }] })).toBe("");
    expect(extractStreamReasoning({ candidates: [{ content: { parts: [{ thought: true, text: "Gemini 推理" }, { text: "答案" }] } }] })).toBe("Gemini 推理");
    expect(extractStreamDelta({ candidates: [{ content: { parts: [{ thought: true, text: "不应进答案" }, { text: "答案" }] } }] })).toBe("答案");
  });

  it("consumes split SSE frames without waiting for the whole response", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"第一"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"段"}}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const onPart = vi.fn();
    const result = await consumeTextStream(new Response(stream), onPart);
    expect(result).toBe("第一段");
    expect(onPart.mock.calls).toEqual([["第一", "answer"], ["段", "answer"]]);
  });

  it("preserves tool history, function schemas and image input for compatible LLMs", () => {
    const messages = responsesInputToChatMessages([
      { type: "message", role: "user", content: [{ type: "input_text", text: "看图" }, { type: "input_image", image_url: "data:image/png;base64,AAAA" }] },
      { type: "function_call", call_id: "call-1", name: "read_file", arguments: "{\"path\":\"a.ts\"}" },
      { type: "function_call_output", call_id: "call-1", output: "ok" },
    ], "遵守项目规则");
    expect(messages[0]).toEqual({ role: "developer", content: "遵守项目规则" });
    expect(messages[1].content).toEqual([
      { type: "text", text: "看图" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
    expect(messages[2].tool_calls?.[0].function.name).toBe("read_file");
    expect(messages[3]).toMatchObject({ role: "tool", tool_call_id: "call-1", name: "read_file", content: "ok" });
    expect(responsesToolsToChatTools([{ type: "function", name: "read_file", parameters: { type: "object" }, strict: true }])[0].function.strict).toBe(true);
  });

  it("reassembles streamed tool calls without losing argument chunks", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_file","arguments":"{\\"path\\":"}}]}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.ts\\"}"}}]}}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const result = await consumeAgentStream(new Response(stream), "chat-completions", vi.fn());
    expect(result.toolCalls).toEqual([{ id: "call-1", name: "read_file", arguments: "{\"path\":\"a.ts\"}" }]);
  });

  it("surfaces an error event emitted after an SSE stream has already opened", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"error":{"code":"upstream_error","message":"Bailian stream failed"}}\n\n'));
        controller.close();
      },
    });
    await expect(consumeAgentStream(new Response(stream), "chat-completions", vi.fn()))
      .rejects.toThrow("Bailian stream failed");
  });

  it("adapts Bailian DeepSeek Agent requests to its Chat contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const providerStore = {
      status: vi.fn(async () => ({
        configured: true,
        profile: { baseUrl: "https://ai-mcp.wuread.cn" },
      })),
      readCredentials: vi.fn(async () => ({ apiKey: "test-key" })),
    };
    const client = new ProviderClient(providerStore as never, {} as never);

    const upstream = await client.openAgentResponse("deepseek-v4-pro", {
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "执行任务" }] }],
      instructions: "使用项目 Skills 和工具完成任务",
      tools: [{ type: "function", name: "read_file", parameters: { type: "object", properties: {} } }],
      max_output_tokens: 2048,
      stream: true,
    });

    expect(upstream.protocol).toBe("chat-completions");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai-mcp.wuread.cn/v1/chat/completions");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "deepseek-v4-pro",
      max_completion_tokens: 2048,
      stream_options: { include_usage: true },
      stream: true,
    });
    expect(body).not.toHaveProperty("max_tokens");
    expect((body.messages as Array<Record<string, unknown>>)[0]).toMatchObject({
      role: "system",
      content: "使用项目 Skills 和工具完成任务",
    });
    expect((body.tools as Array<Record<string, unknown>>)[0]).toMatchObject({
      type: "function",
      function: { name: "read_file" },
    });
  });
});
