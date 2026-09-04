import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { consumeAgentStream, type AgentStreamResult, type AgentToolCall, type ProviderClient } from "./providerClient";

type ResponsesRequest = Record<string, unknown> & {
  model?: string;
  stream?: boolean;
};

function jsonError(response: ServerResponse, status: number, message: string) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: { type: "aiyou_gateway_error", message: message.slice(0, 1000) } }));
}

function sanitizeErrorDetail(value: string) {
  return value
    .replace(/https?:\/\/(?:127(?:\.\d{1,3}){3}|localhost|\[::1\])(?::\d+)?(?:\/[^\s"'<>]*)?/gi, "AIYOU 本地网关")
    .replace(/\b(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s"'<>]*)?/gi, "AIYOU 本地网关")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [已隐藏]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[密钥已隐藏]")
    .trim()
    .slice(0, 600);
}

function errorDetail(text: string) {
  if (!text) return "";
  const readable = (value: string) => /Aliyun Bailian upstream connection failed/i.test(value)
    ? "阿里云百炼上游连接失败"
    : sanitizeErrorDetail(value);
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const nested = body.error && typeof body.error === "object"
      ? body.error as Record<string, unknown>
      : undefined;
    return readable(String(nested?.message ?? body.message ?? body.error ?? ""));
  } catch {
    return readable(text);
  }
}

async function normalizedUpstreamError(upstream: Awaited<ReturnType<ProviderClient["openAgentResponse"]>>) {
  const status = upstream.response.status;
  const detail = errorDetail(await upstream.response.text());
  const provider = upstream.model.providerName ?? upstream.model.providerId ?? "模型平台";
  const protocol = upstream.protocol === "chat-completions" ? "Chat Completions" : upstream.protocol === "responses" ? "Responses" : upstream.protocol;
  const category = status === 401
    ? "凭证无效或已过期"
    : status === 403
      ? "模型未授权或账号无调用权限"
      : status === 429
        ? "请求频率或配额受限"
        : [502, 503, 504].includes(status)
          ? "上游服务暂时不可用"
          : "上游请求失败";
  return `${provider} · ${upstream.model.name} · ${protocol} 请求失败（HTTP ${status}，${category}）${detail ? `：${detail}` : ""}`;
}

async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.byteLength;
    if (size > 10 * 1024 * 1024) throw new Error("请求体超过 10 MB 限制");
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Responses 请求体必须是 JSON 对象");
  return value as ResponsesRequest;
}

async function pipeWebResponse(upstream: Response, response: ServerResponse) {
  const headers: Record<string, string> = {};
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;
  const cacheControl = upstream.headers.get("cache-control");
  if (cacheControl) headers["cache-control"] = cacheControl;
  response.writeHead(upstream.status, headers);
  if (!upstream.body) return response.end();
  const reader = upstream.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    response.write(Buffer.from(value));
  }
  response.end();
}

class ResponsesStreamWriter {
  private readonly responseId = `resp_${randomUUID().replaceAll("-", "")}`;
  private readonly createdAt = Math.floor(Date.now() / 1000);
  private readonly outputs: Array<Record<string, unknown>> = [];
  private sequence = 0;
  private text = "";
  private reasoning = "";
  private textItemId: string | null = null;
  private reasoningItemId: string | null = null;
  private textOutputIndex: number | null = null;
  private reasoningOutputIndex: number | null = null;
  private closed = false;

  constructor(
    private readonly target: ServerResponse,
    private readonly request: ResponsesRequest,
  ) {
    target.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-aiyou-agent-runtime": "codex-app-server",
    });
    const response = this.response("in_progress");
    this.emit({ type: "response.created", response });
    this.emit({ type: "response.in_progress", response });
  }

  private response(status: "in_progress" | "completed" | "failed", extra: Record<string, unknown> = {}) {
    return {
      id: this.responseId,
      object: "response",
      created_at: this.createdAt,
      status,
      model: String(this.request.model ?? "aiyou-model"),
      output: status === "completed" ? this.outputs : [],
      parallel_tool_calls: this.request.parallel_tool_calls ?? true,
      tool_choice: this.request.tool_choice ?? "auto",
      tools: Array.isArray(this.request.tools) ? this.request.tools : [],
      error: null,
      incomplete_details: null,
      instructions: null,
      metadata: {},
      ...extra,
    };
  }

  private emit(event: Record<string, unknown>) {
    if (this.closed) return;
    const withSequence = { ...event, sequence_number: this.sequence++ };
    this.target.write(`event: ${String(event.type)}\n`);
    this.target.write(`data: ${JSON.stringify(withSequence)}\n\n`);
  }

  addText(delta: string) {
    if (!delta || this.closed) return;
    if (!this.textItemId) {
      this.textItemId = `msg_${randomUUID().replaceAll("-", "")}`;
      const item = { id: this.textItemId, type: "message", status: "in_progress", role: "assistant", content: [] };
      const part = { type: "output_text", text: "", annotations: [], logprobs: [] };
      this.textOutputIndex = this.outputs.length;
      this.outputs.push(item);
      this.emit({ type: "response.output_item.added", output_index: this.textOutputIndex, item });
      this.emit({ type: "response.content_part.added", item_id: this.textItemId, output_index: this.textOutputIndex, content_index: 0, part });
    }
    this.text += delta;
    this.emit({ type: "response.output_text.delta", item_id: this.textItemId, output_index: this.textOutputIndex, content_index: 0, delta, logprobs: [] });
  }

  addReasoning(delta: string) {
    if (!delta || this.closed) return;
    if (!this.reasoningItemId) {
      this.reasoningItemId = `rs_${randomUUID().replaceAll("-", "")}`;
      const item = { id: this.reasoningItemId, type: "reasoning", summary: [] };
      const part = { type: "summary_text", text: "" };
      this.reasoningOutputIndex = this.outputs.length;
      this.outputs.push(item);
      this.emit({ type: "response.output_item.added", output_index: this.reasoningOutputIndex, item });
      this.emit({ type: "response.reasoning_summary_part.added", item_id: this.reasoningItemId, output_index: this.reasoningOutputIndex, summary_index: 0, part });
    }
    this.reasoning += delta;
    this.emit({ type: "response.reasoning_summary_text.delta", item_id: this.reasoningItemId, output_index: this.reasoningOutputIndex, summary_index: 0, delta });
  }

  private finishReasoning() {
    if (!this.reasoningItemId) return;
    const outputIndex = this.reasoningOutputIndex!;
    const part = { type: "summary_text", text: this.reasoning };
    const item = { id: this.reasoningItemId, type: "reasoning", summary: [part] };
    this.emit({ type: "response.reasoning_summary_text.done", item_id: this.reasoningItemId, output_index: outputIndex, summary_index: 0, text: this.reasoning });
    this.emit({ type: "response.reasoning_summary_part.done", item_id: this.reasoningItemId, output_index: outputIndex, summary_index: 0, part });
    this.emit({ type: "response.output_item.done", output_index: outputIndex, item });
    this.outputs[outputIndex] = item;
  }

  private finishText() {
    if (!this.textItemId) return;
    const outputIndex = this.textOutputIndex!;
    const part = { type: "output_text", text: this.text, annotations: [], logprobs: [] };
    const item = { id: this.textItemId, type: "message", status: "completed", role: "assistant", content: [part] };
    this.emit({ type: "response.output_text.done", item_id: this.textItemId, output_index: outputIndex, content_index: 0, text: this.text, logprobs: [] });
    this.emit({ type: "response.content_part.done", item_id: this.textItemId, output_index: outputIndex, content_index: 0, part });
    this.emit({ type: "response.output_item.done", output_index: outputIndex, item });
    this.outputs[outputIndex] = item;
  }

  private addToolCall(call: AgentToolCall) {
    const outputIndex = this.outputs.length;
    const itemId = `fc_${randomUUID().replaceAll("-", "")}`;
    const callId = call.id || `call_${randomUUID().replaceAll("-", "")}`;
    const started = { id: itemId, type: "function_call", status: "in_progress", arguments: "", call_id: callId, name: call.name };
    const done = { ...started, status: "completed", arguments: call.arguments || "{}" };
    this.emit({ type: "response.output_item.added", output_index: outputIndex, item: started });
    if (call.arguments) this.emit({ type: "response.function_call_arguments.delta", item_id: itemId, output_index: outputIndex, delta: call.arguments });
    this.emit({ type: "response.function_call_arguments.done", item_id: itemId, output_index: outputIndex, arguments: call.arguments || "{}" });
    this.emit({ type: "response.output_item.done", output_index: outputIndex, item: done });
    this.outputs.push(done);
  }

  complete(result: AgentStreamResult) {
    if (this.closed) return;
    this.finishReasoning();
    this.finishText();
    for (const call of result.toolCalls) this.addToolCall(call);
    const usage = normalizeUsage(result.usage);
    this.emit({ type: "response.completed", response: this.response("completed", { usage }) });
    this.closed = true;
    this.target.end();
  }

  fail(message: string) {
    if (this.closed) return;
    const error = { type: "aiyou_gateway_error", code: "provider_error", message: message.slice(0, 1000) };
    this.emit({ type: "response.failed", response: this.response("failed", { error }) });
    this.closed = true;
    this.target.end();
  }
}

function normalizeUsage(usage?: Record<string, unknown>) {
  const input = Number(usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.promptTokenCount ?? 0);
  const output = Number(usage?.output_tokens ?? usage?.completion_tokens ?? usage?.candidatesTokenCount ?? 0);
  const inputDetails = usage?.input_tokens_details as Record<string, unknown> | undefined;
  const promptDetails = usage?.prompt_tokens_details as Record<string, unknown> | undefined;
  const outputDetails = usage?.output_tokens_details as Record<string, unknown> | undefined;
  const completionDetails = usage?.completion_tokens_details as Record<string, unknown> | undefined;
  return {
    input_tokens: input,
    input_tokens_details: { cached_tokens: Number(inputDetails?.cached_tokens ?? promptDetails?.cached_tokens ?? 0) },
    output_tokens: output,
    output_tokens_details: { reasoning_tokens: Number(outputDetails?.reasoning_tokens ?? completionDetails?.reasoning_tokens ?? 0) },
    total_tokens: Number(usage?.total_tokens ?? usage?.totalTokenCount ?? input + output),
  };
}

export class ResponsesGateway {
  private server: Server | null = null;
  private port = 0;

  constructor(private readonly providers: ProviderClient) {}

  get baseUrl() {
    if (!this.port) throw new Error("AIYOU Responses gateway 尚未启动");
    return `http://127.0.0.1:${this.port}/v1`;
  }

  async start() {
    if (this.server) return this.baseUrl;
    this.server = createServer((request, response) => void this.handle(request, response));
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("无法取得 AIYOU Responses gateway 端口");
    this.port = address.port;
    return this.baseUrl;
  }

  async stop() {
    const server = this.server;
    this.server = null;
    this.port = 0;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, runtime: "codex-app-server" }));
      return;
    }
    if (request.method !== "POST" || request.url?.split("?", 1)[0] !== "/v1/responses") {
      jsonError(response, 404, "未知的 AIYOU gateway 路径");
      return;
    }
    const controller = new AbortController();
    request.once("aborted", () => controller.abort());
    let body: ResponsesRequest | undefined;
    try {
      body = await requestBody(request);
      const modelId = String(body.model ?? "");
      if (!modelId) throw new Error("缺少模型 ID");
      const upstream = await this.providers.openAgentResponse(modelId, body, controller.signal);
      if (!upstream.response.ok) {
        const message = await normalizedUpstreamError(upstream);
        if (body.stream === true) {
          const writer = new ResponsesStreamWriter(response, body);
          writer.fail(message);
        } else {
          jsonError(response, upstream.response.status, message);
        }
        return;
      }
      if (upstream.protocol === "responses") {
        await pipeWebResponse(upstream.response, response);
        return;
      }
      const writer = new ResponsesStreamWriter(response, body);
      try {
        const result = await consumeAgentStream(upstream.response, upstream.protocol, (delta, kind) => {
          if (kind === "reasoning") writer.addReasoning(delta);
          else writer.addText(delta);
        });
        if (!result.text && !result.reasoning && result.toolCalls.length === 0) writer.fail("模型平台未返回文本、推理摘要或工具调用");
        else writer.complete(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取模型流失败";
        writer.fail(errorDetail(message) || "读取模型流失败");
      }
    } catch (error) {
      const message = sanitizeErrorDetail(error instanceof Error ? error.message : "AIYOU gateway 请求失败");
      if (!response.headersSent && body?.stream === true) {
        const writer = new ResponsesStreamWriter(response, body);
        writer.fail(message);
      } else if (!response.headersSent) jsonError(response, body ? 502 : 400, message);
      else response.end();
    }
  }
}
