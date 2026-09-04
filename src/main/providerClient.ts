import {
  MODEL_ID_SEPARATOR,
  PROVIDER_BY_ID,
  allProviderModels,
  getProviderModel,
  providerForModel,
} from "../shared/providerCatalog";
import type {
  ConnectionTest,
  GenerationRequest,
  GenerationResponse,
  GenerationStreamChunk,
  ModelCategory,
  ModelDefinition,
  ProviderDefinition,
} from "../shared/types";
import { sanitizePayload } from "../shared/requestRouter";
import type { AiTaskClient } from "./aiTaskClient";
import type { ProviderStore } from "./settingsStore";

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function replaceTokens(path: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, encodeURIComponent(value)),
    path,
  );
}

async function decodeResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function responseMessage(body: Record<string, unknown>, fallback: string) {
  const nested = body.error && typeof body.error === "object"
    ? (body.error as Record<string, unknown>).message
    : undefined;
  return String(body.message ?? nested ?? body.error ?? fallback);
}

function guessCategory(modelId: string): ModelCategory {
  const value = modelId.toLowerCase();
  if (/sora|veo|video|hailuo|seedance|wan|kling|vidu|ray-/.test(value)) return "video";
  if (/image|imagen|flux|recraft|seedream|banana/.test(value)) return "image";
  if (/speech|tts|audio|voice|whisper|transcri|voxtral/.test(value)) return "audio";
  return "text";
}

function modelRows(body: Record<string, unknown>, shape: ProviderDefinition["modelListShape"]) {
  const rows = shape === "models" ? body.models : body.data;
  return Array.isArray(rows) ? rows.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

function textPart(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return "";
    const row = item as Record<string, unknown>;
    return typeof row.text === "string" ? row.text : "";
  }).join("");
}

type AgentMessage = {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content?: string | Array<Record<string, unknown>> | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AgentStreamResult = {
  text: string;
  reasoning: string;
  toolCalls: AgentToolCall[];
  usage?: Record<string, unknown>;
};

export type AgentUpstreamResponse = {
  response: Response;
  protocol: ModelDefinition["protocol"];
  model: ModelDefinition;
  nativeModelId: string;
};

function streamErrorMessage(payload: Record<string, unknown>) {
  const response = payload.response && typeof payload.response === "object"
    ? payload.response as Record<string, unknown>
    : undefined;
  const error = payload.error ?? response?.error;
  const terminal = payload.type === "error" || payload.type === "response.failed" || response?.status === "failed";
  if (!error && !terminal) return "";
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const detail = error as Record<string, unknown>;
    return String(detail.message ?? detail.detail ?? detail.code ?? "模型平台流式响应失败");
  }
  return String(payload.message ?? response?.message ?? "模型平台流式响应失败");
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    const row = part as Record<string, unknown>;
    if (typeof row.text === "string") return row.text;
    if (typeof row.output_text === "string") return row.output_text;
    return "";
  }).filter(Boolean).join("\n");
}

function responseContentToChatContent(content: unknown): string | Array<Record<string, unknown>> {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: Array<Record<string, unknown>> = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push({ type: "text", text: part });
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const row = part as Record<string, unknown>;
    const text = typeof row.text === "string" ? row.text : typeof row.output_text === "string" ? row.output_text : undefined;
    if (text) {
      parts.push({ type: "text", text });
      continue;
    }
    const source = typeof row.image_url === "string"
      ? row.image_url
      : row.image_url && typeof row.image_url === "object"
        ? String((row.image_url as Record<string, unknown>).url ?? "")
        : typeof row.url === "string" ? row.url : "";
    if (source) parts.push({ type: "image_url", image_url: { url: source, ...(row.detail ? { detail: row.detail } : {}) } });
  }
  return parts.some((part) => part.type === "image_url")
    ? parts
    : parts.map((part) => String(part.text ?? "")).join("\n");
}

function anthropicContent(content: AgentMessage["content"]): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return contentText(content) ? [{ type: "text", text: contentText(content) }] : [];
  const parts: Array<Record<string, unknown>> = [];
  for (const part of content) {
    if (part.type === "text" && typeof part.text === "string") {
      parts.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type !== "image_url" || !part.image_url || typeof part.image_url !== "object") continue;
    const url = String((part.image_url as Record<string, unknown>).url ?? "");
    const data = url.match(/^data:([^;,]+);base64,(.+)$/);
    if (data) parts.push({ type: "image", source: { type: "base64", media_type: data[1], data: data[2] } });
    else if (url) parts.push({ type: "image", source: { type: "url", url } });
  }
  return parts;
}

function geminiParts(content: AgentMessage["content"]): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return contentText(content) ? [{ text: contentText(content) }] : [];
  const parts: Array<Record<string, unknown>> = [];
  for (const part of content) {
    if (part.type === "text" && typeof part.text === "string") {
      parts.push({ text: part.text });
      continue;
    }
    if (part.type !== "image_url" || !part.image_url || typeof part.image_url !== "object") continue;
    const url = String((part.image_url as Record<string, unknown>).url ?? "");
    const data = url.match(/^data:([^;,]+);base64,(.+)$/);
    if (data) parts.push({ inlineData: { mimeType: data[1], data: data[2] } });
    else if (url) parts.push({ fileData: { fileUri: url } });
  }
  return parts;
}

/** Converts Responses API history into the Chat Completions message contract. */
export function responsesInputToChatMessages(
  input: unknown,
  instructions?: unknown,
): AgentMessage[] {
  const messages: AgentMessage[] = [];
  const callNames = new Map<string, string>();
  const instructionText = contentText(instructions);
  if (instructionText) messages.push({ role: "developer", content: instructionText });
  const rows = typeof input === "string"
    ? [{ type: "message", role: "user", content: [{ type: "input_text", text: input }] }]
    : Array.isArray(input) ? input : [];
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    if (row.type === "message") {
      const rawRole = String(row.role ?? "user");
      const role: AgentMessage["role"] = ["system", "developer", "assistant", "tool"].includes(rawRole)
        ? rawRole as AgentMessage["role"]
        : "user";
      const content = responseContentToChatContent(row.content);
      if (contentText(content) || Array.isArray(content) && content.length) messages.push({ role, content });
      continue;
    }
    if (row.type === "function_call") {
      const callId = String(row.call_id ?? row.id ?? crypto.randomUUID());
      const name = String(row.name ?? "tool");
      callNames.set(callId, name);
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: callId,
          type: "function",
          function: {
            name,
            arguments: typeof row.arguments === "string" ? row.arguments : JSON.stringify(row.arguments ?? {}),
          },
        }],
      });
      continue;
    }
    if (row.type === "function_call_output") {
      const callId = String(row.call_id ?? row.id ?? "");
      messages.push({
        role: "tool",
        tool_call_id: callId,
        name: callNames.get(callId),
        content: contentText(row.output) || JSON.stringify(row.output ?? ""),
      });
    }
  }
  return messages;
}

export function responsesToolsToChatTools(tools: unknown) {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const tool = value as Record<string, unknown>;
    if (tool.type !== "function" || !tool.name) return [];
    return [{
      type: "function" as const,
      function: {
        name: String(tool.name),
        description: typeof tool.description === "string" ? tool.description : undefined,
        parameters: tool.parameters && typeof tool.parameters === "object" ? tool.parameters : { type: "object", properties: {} },
        ...(typeof tool.strict === "boolean" ? { strict: tool.strict } : {}),
      },
    }];
  });
}

function responsesToolsToAnthropic(tools: unknown) {
  return responsesToolsToChatTools(tools).map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

function chatMessagesToAnthropic(messages: AgentMessage[]) {
  const system = messages
    .filter((message) => message.role === "system" || message.role === "developer")
    .map((message) => contentText(message.content))
    .filter(Boolean)
    .join("\n\n");
  const result: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") continue;
    if (message.role === "tool") {
      result.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: message.tool_call_id, content: contentText(message.content) }],
      });
      continue;
    }
    const content = anthropicContent(message.content);
    for (const call of message.tool_calls ?? []) {
      let input: unknown = {};
      try { input = JSON.parse(call.function.arguments || "{}"); } catch { input = { raw: call.function.arguments }; }
      content.push({ type: "tool_use", id: call.id, name: call.function.name, input });
    }
    result.push({ role: message.role === "assistant" ? "assistant" : "user", content });
  }
  return { system, messages: result };
}

function chatMessagesToGemini(messages: AgentMessage[]) {
  const systemText = messages
    .filter((message) => message.role === "system" || message.role === "developer")
    .map((message) => contentText(message.content))
    .filter(Boolean)
    .join("\n\n");
  const contents: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") continue;
    if (message.role === "tool") {
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: message.name || message.tool_call_id || "tool", response: { output: contentText(message.content) } } }],
      });
      continue;
    }
    const parts = geminiParts(message.content);
    for (const call of message.tool_calls ?? []) {
      let args: unknown = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = { raw: call.function.arguments }; }
      parts.push({ functionCall: { name: call.function.name, args } });
    }
    contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
  }
  return {
    contents,
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
  };
}

/** Extracts only newly generated text from OpenAI, Anthropic and Gemini stream events. */
export function extractStreamDelta(payload: Record<string, unknown>): string {
  if (payload.type === "response.output_text.delta" && typeof payload.delta === "string") return payload.delta;
  const directDelta = payload.delta;
  if (directDelta && typeof directDelta === "object") {
    const text = (directDelta as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }
  const choices = payload.choices;
  if (Array.isArray(choices)) {
    const first = choices[0];
    if (first && typeof first === "object") {
      const delta = (first as Record<string, unknown>).delta;
      if (delta && typeof delta === "object") return textPart((delta as Record<string, unknown>).content);
      const message = (first as Record<string, unknown>).message;
      if (message && typeof message === "object") return textPart((message as Record<string, unknown>).content);
    }
  }
  const candidates = payload.candidates;
  if (Array.isArray(candidates)) {
    return candidates.map((candidate) => {
      if (!candidate || typeof candidate !== "object") return "";
      const content = (candidate as Record<string, unknown>).content;
      if (!content || typeof content !== "object") return "";
      const parts = (content as Record<string, unknown>).parts;
      return Array.isArray(parts) ? textPart(parts.filter((part) => !part || typeof part !== "object" || (part as Record<string, unknown>).thought !== true)) : "";
    }).join("");
  }
  const output = payload.output;
  if (Array.isArray(output)) {
    return output.map((item) => item && typeof item === "object" ? textPart((item as Record<string, unknown>).content) : "").join("");
  }
  return typeof payload.text === "string" ? payload.text : "";
}

/** Reasoning is shown only when the upstream API explicitly returns it. */
export function extractStreamReasoning(payload: Record<string, unknown>): string {
  const type = typeof payload.type === "string" ? payload.type : "";
  if (/reasoning|thinking/.test(type) && typeof payload.delta === "string") return payload.delta;
  const directDelta = payload.delta;
  if (directDelta && typeof directDelta === "object") {
    const row = directDelta as Record<string, unknown>;
    if (typeof row.thinking === "string") return row.thinking;
    if (typeof row.reasoning === "string") return row.reasoning;
    if (typeof row.reasoning_content === "string") return row.reasoning_content;
  }
  const choices = payload.choices;
  if (Array.isArray(choices)) {
    const first = choices[0];
    const delta = first && typeof first === "object" ? (first as Record<string, unknown>).delta : undefined;
    if (delta && typeof delta === "object") {
      const row = delta as Record<string, unknown>;
      return String(row.reasoning_content ?? row.reasoning ?? row.thinking ?? "");
    }
  }
  const candidates = payload.candidates;
  if (Array.isArray(candidates)) {
    return candidates.map((candidate) => {
      const content = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>).content : undefined;
      const parts = content && typeof content === "object" ? (content as Record<string, unknown>).parts : undefined;
      return Array.isArray(parts)
        ? textPart(parts.filter((part) => part && typeof part === "object" && (part as Record<string, unknown>).thought === true))
        : "";
    }).join("");
  }
  return "";
}

function parseStreamFrame(frame: string): Record<string, unknown>[] {
  const data = frame.split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n") || frame.trim();
  if (!data || data === "[DONE]" || data.startsWith("event:")) return [];
  try {
    const parsed = JSON.parse(data) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    return parsed && typeof parsed === "object" ? [parsed as Record<string, unknown>] : [];
  } catch {
    return [];
  }
}

export async function consumeTextStream(
  response: Response,
  onPart: (delta: string, kind: "answer" | "reasoning") => void,
) {
  if (!response.body) throw new Error("模型平台未返回可读取的流式响应体");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";
  const emitFrames = (flush = false) => {
    const normalized = buffer.replace(/\r\n/g, "\n");
    const frames = normalized.split(/\n\n/);
    const trailing = frames.pop() ?? "";
    buffer = flush ? "" : trailing;
    const ready = flush && trailing ? frames.concat(trailing) : frames;
    for (const frame of ready) {
      for (const payload of parseStreamFrame(frame)) {
        const reasoning = extractStreamReasoning(payload);
        if (reasoning) onPart(reasoning, "reasoning");
        const delta = extractStreamDelta(payload);
        if (!delta) continue;
        result += delta;
        onPart(delta, "answer");
      }
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    emitFrames();
  }
  buffer += decoder.decode();
  emitFrames(true);
  return result;
}

/** Consumes a provider stream while preserving native function/tool calls for Codex. */
export async function consumeAgentStream(
  response: Response,
  protocol: ModelDefinition["protocol"],
  onPart: (delta: string, kind: "answer" | "reasoning") => void,
): Promise<AgentStreamResult> {
  if (!response.body) throw new Error("模型平台未返回可读取的流式响应体");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map<string, AgentToolCall>();
  const toolIndexes = new Map<number, string>();
  let buffer = "";
  let text = "";
  let reasoning = "";
  let usage: Record<string, unknown> | undefined;

  const mergeCall = (index: number, id?: string, name?: string, args?: string) => {
    const key = id || toolIndexes.get(index) || `call_${index}`;
    toolIndexes.set(index, key);
    const previous = toolCalls.get(key) ?? { id: key, name: "tool", arguments: "" };
    toolCalls.set(key, {
      id: key,
      name: name || previous.name,
      arguments: previous.arguments + (args ?? ""),
    });
  };

  const inspectPayload = (payload: Record<string, unknown>) => {
    const streamError = streamErrorMessage(payload);
    if (streamError) throw new Error(streamError);
    const nextReasoning = extractStreamReasoning(payload);
    if (nextReasoning) {
      reasoning += nextReasoning;
      onPart(nextReasoning, "reasoning");
    }
    const nextText = extractStreamDelta(payload);
    if (nextText) {
      text += nextText;
      onPart(nextText, "answer");
    }
    if (payload.usage && typeof payload.usage === "object") usage = payload.usage as Record<string, unknown>;
    if (payload.usageMetadata && typeof payload.usageMetadata === "object") usage = payload.usageMetadata as Record<string, unknown>;

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      const row = choice as Record<string, unknown>;
      const delta = row.delta && typeof row.delta === "object" ? row.delta as Record<string, unknown> : undefined;
      const message = row.message && typeof row.message === "object" ? row.message as Record<string, unknown> : undefined;
      const calls = (delta?.tool_calls ?? message?.tool_calls) as unknown;
      if (!Array.isArray(calls)) continue;
      for (const call of calls) {
        if (!call || typeof call !== "object") continue;
        const item = call as Record<string, unknown>;
        const fn = item.function && typeof item.function === "object" ? item.function as Record<string, unknown> : {};
        mergeCall(Number(item.index ?? 0), typeof item.id === "string" ? item.id : undefined, typeof fn.name === "string" ? fn.name : undefined, typeof fn.arguments === "string" ? fn.arguments : undefined);
      }
    }

    if (protocol === "anthropic-messages") {
      const index = Number(payload.index ?? 0);
      const block = payload.content_block && typeof payload.content_block === "object" ? payload.content_block as Record<string, unknown> : undefined;
      if (block?.type === "tool_use") {
        const initialInput = block.input && typeof block.input === "object" && Object.keys(block.input as Record<string, unknown>).length
          ? JSON.stringify(block.input)
          : "";
        mergeCall(index, String(block.id ?? `call_${index}`), String(block.name ?? "tool"), initialInput);
      }
      const delta = payload.delta && typeof payload.delta === "object" ? payload.delta as Record<string, unknown> : undefined;
      if (delta?.type === "input_json_delta") mergeCall(index, undefined, undefined, String(delta.partial_json ?? ""));
    }

    if (protocol === "gemini-generate") {
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      let index = 0;
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object") continue;
        const content = (candidate as Record<string, unknown>).content;
        const parts = content && typeof content === "object" && Array.isArray((content as Record<string, unknown>).parts)
          ? (content as Record<string, unknown>).parts as unknown[]
          : [];
        for (const part of parts) {
          if (!part || typeof part !== "object") continue;
          const call = (part as Record<string, unknown>).functionCall;
          if (!call || typeof call !== "object") continue;
          const item = call as Record<string, unknown>;
          mergeCall(index++, undefined, String(item.name ?? "tool"), JSON.stringify(item.args ?? {}));
        }
      }
    }
  };

  const emitFrames = (flush = false) => {
    const normalized = buffer.replace(/\r\n/g, "\n");
    const frames = normalized.split(/\n\n/);
    const trailing = frames.pop() ?? "";
    buffer = flush ? "" : trailing;
    const ready = flush && trailing ? frames.concat(trailing) : frames;
    for (const frame of ready) for (const payload of parseStreamFrame(frame)) inspectPayload(payload);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    emitFrames();
  }
  buffer += decoder.decode();
  emitFrames(true);
  return { text, reasoning, toolCalls: [...toolCalls.values()], usage };
}

export class ProviderClient {
  private readonly syncedModels = new Map<string, ModelDefinition[]>();

  constructor(
    private readonly providers: ProviderStore,
    private readonly aiTask: AiTaskClient,
  ) {}

  private async headers(definition: ProviderDefinition, hasBody = false) {
    const credentials = await this.providers.readCredentials(definition.id);
    const headers = new Headers();
    if (hasBody) headers.set("Content-Type", "application/json");
    for (const [key, value] of Object.entries(definition.extraHeaders ?? {})) {
      if (key === "X-AIYOU-Auth-Prefix") continue;
      headers.set(key, value);
    }
    const key = credentials.apiKey ?? "";
    if (definition.authType === "bearer" && key) headers.set("Authorization", `Bearer ${key}`);
    if (definition.authType === "x-api-key" && key) headers.set(definition.authHeader ?? "x-api-key", key);
    if (definition.authType === "google-api-key" && key) headers.set("x-goog-api-key", key);
    if (definition.authType === "anthropic" && key) headers.set("x-api-key", key);
    if (definition.authType === "dual-key") {
      headers.set("X-API-Key", key);
      headers.set("Authorization", `Bearer ${key}`);
    }
    if (definition.authType === "api-key-header" && key) {
      const prefix = definition.extraHeaders?.["X-AIYOU-Auth-Prefix"];
      headers.set(definition.authHeader ?? "x-api-key", prefix ? `${prefix} ${key}` : key);
    }
    return headers;
  }

  private async requestRaw(
    definition: ProviderDefinition,
    path: string,
    init: RequestInit = {},
    timeout = 30_000,
  ) {
    const state = await this.providers.status(definition.id);
    if (!state.configured) throw new Error(`请先配置 ${definition.name} 所需凭证`);
    if (definition.authType === "multi-field") {
      throw new Error(`${definition.name} 使用请求签名，当前版本已完成凭证配置，生成适配将在签名模块启用后开放`);
    }
    const headers = await this.headers(definition, typeof init.body === "string");
    const timeoutSignal = AbortSignal.timeout(timeout);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    const response = await fetch(`${cleanBaseUrl(state.profile.baseUrl)}${path}`, {
      ...init,
      headers,
      signal,
    });
    return response;
  }

  private async request(
    definition: ProviderDefinition,
    path: string,
    init: RequestInit = {},
  ) {
    const response = await this.requestRaw(definition, path, init);
    return { response, body: await decodeResponse(response) };
  }

  async test(providerId: string): Promise<ConnectionTest> {
    const definition = PROVIDER_BY_ID.get(providerId);
    if (!definition) return { ok: false, status: 0, message: "未知模型平台" };
    try {
      const state = await this.providers.status(providerId);
      if (!state.configured) return { ok: false, status: 0, message: "请先填写并保存必需凭证" };
      if (definition.support === "configuration" || !definition.testPath) {
        return {
          ok: true,
          status: -1,
          message: definition.support === "configuration"
            ? "凭证已加密保存；该平台需要原生签名，未发送远程请求"
            : "凭证已加密保存；官方未提供无费用的统一模型目录，未发送生成请求",
          modelCount: definition.models.length || undefined,
        };
      }
      const { response, body } = await this.request(definition, definition.testPath, { method: definition.testMethod ?? "GET" });
      const rows = modelRows(body, definition.modelListShape);
      return {
        ok: response.ok,
        status: response.status,
        message: response.ok
          ? definition.id === "ai-task-mcp"
            ? "平台与模型目录可访问，Key 有效；尚未调用付费模型验证每个上游通道"
            : "官方平台连接与凭证校验成功"
          : responseMessage(body, `HTTP ${response.status}`),
        modelCount: rows.length || definition.models.length || undefined,
      };
    } catch (error) {
      return { ok: false, status: 0, message: error instanceof Error ? error.message : "连接失败" };
    }
  }

  private async resolveModel(modelId: string) {
    const definition = providerForModel(modelId);
    const known = getProviderModel(modelId)
      ?? (definition ? this.syncedModels.get(definition.id)?.find((item) => item.id === modelId) : undefined);
    if (known) return known;
    if (definition?.id === "custom-openai" && modelId.startsWith(`custom-openai${MODEL_ID_SEPARATOR}`)) {
      const nativeModelId = modelId.slice(`custom-openai${MODEL_ID_SEPARATOR}`.length);
      if (!nativeModelId) return undefined;
      const seed = definition.models[0];
      return { ...seed, id: modelId, nativeModelId, name: nativeModelId };
    }
    return undefined;
  }

  async listModels() {
    const syncedIds = new Set(this.syncedModels.keys());
    const models = allProviderModels().filter((model) => !model.providerId || !syncedIds.has(model.providerId)).concat(...this.syncedModels.values());
    const profile = await this.providers.profile("custom-openai");
    const ids = String(profile.values.modelIds ?? "").split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
    const existing = new Set(models.map((model) => model.id));
    for (const nativeModelId of ids) {
      const id = `custom-openai${MODEL_ID_SEPARATOR}${nativeModelId}`;
      if (existing.has(id)) continue;
      const model = await this.resolveModel(id);
      if (model) models.push(model);
    }
    return models;
  }

  model(modelId: string) {
    return this.resolveModel(modelId);
  }

  async refreshModels(providerId?: string) {
    const ids = providerId ? [providerId] : (await this.providers.list())
      .filter((item) => item.profile.enabled && item.configured && item.modelListPath && item.id !== "ai-task-mcp")
      .map((item) => item.id);
    await Promise.allSettled(ids.map(async (id) => {
      const definition = PROVIDER_BY_ID.get(id);
      if (!definition?.modelListPath || definition.support !== "native") return;
      const { response, body } = await this.request(definition, definition.modelListPath);
      if (!response.ok) return;
      const seeds = new Map(definition.models.map((model) => [model.nativeModelId, model]));
      const models = modelRows(body, definition.modelListShape).flatMap((row) => {
        const rawId = String(row.id ?? row.name ?? row.baseModelId ?? "").replace(/^models\//, "");
        if (!rawId) return [];
        const seeded = seeds.get(rawId);
        if (seeded) return [{ ...seeded, name: String(row.display_name ?? row.displayName ?? seeded.name) }];
        const category = guessCategory(rawId);
        const categorySeed = definition.models.find((model) => model.category === category);
        return [{
          id: `${definition.id}${MODEL_ID_SEPARATOR}${rawId}`,
          nativeModelId: rawId,
          name: String(row.display_name ?? row.displayName ?? rawId),
          category,
          capability: "从官方模型目录动态同步；具体输入输出能力以官方账号权限为准",
          submitPath: categorySeed?.submitPath ?? (category === "text" ? "/v1/chat/completions" : ""),
          statusPath: categorySeed?.statusPath,
          protocol: categorySeed?.protocol ?? (category === "text" ? "chat-completions" as const : "native-http" as const),
          providerId: definition.id,
          providerName: definition.name,
          providerKind: definition.kind,
          support: definition.support,
        }];
      });
      if (models.length) this.syncedModels.set(id, models);
    }));
    return this.listModels();
  }

  /**
   * Opens one provider request for the AIYOU Responses gateway. Codex remains
   * the Agent runtime; this method only translates the model wire protocol.
   */
  async openAgentResponse(
    modelId: string,
    request: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<AgentUpstreamResponse> {
    const definition = providerForModel(modelId);
    const model = await this.resolveModel(modelId);
    if (!definition || !model) throw new Error(`未知模型：${modelId}`);
    if (model.category !== "text" || !["responses", "chat-completions", "anthropic-messages", "gemini-generate"].includes(model.protocol)) {
      throw new Error("只有支持流式文本协议的 LLM 才能进入 Agent Runtime");
    }
    const derivedModelId = modelId.split(MODEL_ID_SEPARATOR).slice(1).join(MODEL_ID_SEPARATOR);
    const nativeModelId = model.nativeModelId ?? (derivedModelId || modelId);
    const bailianDeepSeek = definition.id === "ai-task-mcp" && nativeModelId === "deepseek-v4-pro";
    const convertedMessages = responsesInputToChatMessages(request.input, request.instructions);
    const messages = bailianDeepSeek
      ? convertedMessages.map((message): AgentMessage => message.role === "developer"
        ? { ...message, role: "system" }
        : message)
      : convertedMessages;
    const chatTools = responsesToolsToChatTools(request.tools);
    let body: Record<string, unknown>;
    let path = replaceTokens(model.submitPath, { model: nativeModelId, voiceId: "" });

    if (model.protocol === "responses") {
      body = { ...request, model: nativeModelId, stream: true };
      delete body.client_metadata;
    } else if (model.protocol === "chat-completions") {
      body = sanitizePayload({
        model: nativeModelId,
        messages,
        tools: chatTools,
        tool_choice: chatTools.length ? request.tool_choice ?? "auto" : undefined,
        parallel_tool_calls: chatTools.length ? request.parallel_tool_calls ?? true : undefined,
        max_tokens: bailianDeepSeek ? undefined : request.max_output_tokens,
        max_completion_tokens: bailianDeepSeek ? request.max_output_tokens : undefined,
        stream_options: bailianDeepSeek ? { include_usage: true } : undefined,
        stream: true,
      });
    } else if (model.protocol === "anthropic-messages") {
      const anthropic = chatMessagesToAnthropic(messages);
      body = sanitizePayload({
        model: nativeModelId,
        system: anthropic.system,
        messages: anthropic.messages,
        tools: responsesToolsToAnthropic(request.tools),
        max_tokens: request.max_output_tokens ?? 4096,
        stream: true,
      });
    } else {
      const gemini = chatMessagesToGemini(messages);
      const declarations = chatTools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      }));
      body = sanitizePayload({
        ...gemini,
        tools: declarations.length ? [{ functionDeclarations: declarations }] : undefined,
        generationConfig: request.max_output_tokens ? { maxOutputTokens: request.max_output_tokens } : undefined,
      });
      path = path.replace(":generateContent", ":streamGenerateContent");
      path += path.includes("?") ? "&alt=sse" : "?alt=sse";
    }

    const response = await this.requestRaw(definition, path, {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    }, 300_000);
    return { response, protocol: model.protocol, model, nativeModelId };
  }

  async submit(request: GenerationRequest): Promise<GenerationResponse> {
    const definition = providerForModel(request.model);
    if (!definition || definition.id === "ai-task-mcp") return this.aiTask.submit(request);
    const model = await this.resolveModel(request.model);
    if (!model) return { success: false, status: 0, error: `未知模型：${request.model}` };
    try {
      const nativeId = model.nativeModelId ?? request.model.split(MODEL_ID_SEPARATOR).slice(1).join(MODEL_ID_SEPARATOR);
      const payload = sanitizePayload({ ...request.payload });
      let body: Record<string, unknown> = { ...payload, model: nativeId };
      if (model.protocol === "responses") {
        body = sanitizePayload({ ...body, input: body.input ?? body.messages ?? body.question ?? body.prompt ?? "", stream: body.stream ?? false });
        delete body.question;
        delete body.prompt;
        delete body.messages;
      }
      if (model.protocol === "chat-completions") {
        body = sanitizePayload({
          ...body,
          messages: Array.isArray(body.messages) ? body.messages : [{ role: "user", content: String(body.question ?? body.prompt ?? "") }],
          stream: body.stream ?? false,
        });
        delete body.question;
        delete body.prompt;
      }
      if (model.protocol === "anthropic-messages") {
        body = sanitizePayload({
          ...body,
          messages: Array.isArray(body.messages) ? body.messages : [{ role: "user", content: String(body.question ?? body.prompt ?? "") }],
          max_tokens: body.max_tokens ?? 4096,
        });
        delete body.question;
        delete body.prompt;
      }
      if (model.protocol === "gemini-generate") {
        const prompt = String(body.question ?? body.prompt ?? "");
        const messages = Array.isArray(body.messages) ? body.messages : [];
        body = Array.isArray(body.contents) ? body : {
          ...body,
          contents: messages.length
            ? messages.map((value) => {
              const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
              return { role: row.role === "assistant" ? "model" : "user", parts: [{ text: contentText(row.content) }] };
            })
            : [{ parts: [{ text: prompt }] }],
        };
        delete body.model;
        delete body.question;
        delete body.prompt;
        delete body.messages;
      }
      const path = replaceTokens(model.submitPath, {
        model: nativeId,
        voiceId: String(body.voiceId ?? ""),
      });
      if (!path) throw new Error(`${definition.name} 的该模型需要从官方目录补充原生生成端点`);
      let requestBody: BodyInit = JSON.stringify(body);
      if (definition.id === "stability") {
        const form = new FormData();
        for (const [key, value] of Object.entries(body)) {
          if (value === undefined || value === null || typeof value === "object") continue;
          form.append(key, String(value));
        }
        form.delete("model");
        requestBody = form;
      }
      const { response, body: responseBody } = await this.request(definition, path, { method: "POST", body: requestBody });
      return {
        success: response.ok,
        status: response.status,
        data: responseBody,
        error: response.ok ? undefined : responseMessage(responseBody, `HTTP ${response.status}`),
      };
    } catch (error) {
      return { success: false, status: 0, error: error instanceof Error ? error.message : "请求失败" };
    }
  }

  async stream(
    request: GenerationRequest,
    onChunk: (chunk: Omit<GenerationStreamChunk, "requestId">) => void,
    signal?: AbortSignal,
  ): Promise<GenerationResponse> {
    const definition = providerForModel(request.model);
    const model = await this.resolveModel(request.model);
    if (!definition || !model) return { success: false, status: 0, error: `未知模型：${request.model}` };
    if (model.category !== "text" || !["responses", "chat-completions", "anthropic-messages", "gemini-generate"].includes(model.protocol)) {
      return { success: false, status: 0, error: "该模型不支持在对话框中进行流式文本输出" };
    }
    try {
      const nativeId = model.nativeModelId ?? request.model.split(MODEL_ID_SEPARATOR).slice(1).join(MODEL_ID_SEPARATOR);
      const source = sanitizePayload({ ...request.payload });
      const prompt = String(source.question ?? source.prompt ?? "");
      let body: Record<string, unknown>;
      if (model.protocol === "responses") {
        body = sanitizePayload({ ...source, model: nativeId, input: source.input ?? source.messages ?? prompt, stream: true });
        delete body.question;
        delete body.prompt;
        delete body.messages;
      } else if (model.protocol === "chat-completions") {
        body = sanitizePayload({
          ...source,
          model: nativeId,
          messages: Array.isArray(source.messages) ? source.messages : [{ role: "user", content: prompt }],
          stream: true,
        });
        delete body.question;
        delete body.prompt;
      } else if (model.protocol === "anthropic-messages") {
        body = sanitizePayload({
          ...source,
          model: nativeId,
          messages: Array.isArray(source.messages) ? source.messages : [{ role: "user", content: prompt }],
          max_tokens: source.max_tokens ?? 4096,
          stream: true,
        });
        delete body.question;
        delete body.prompt;
      } else {
        const messages = Array.isArray(source.messages) ? source.messages : [];
        body = Array.isArray(source.contents)
          ? { ...source, contents: source.contents }
          : {
            ...source,
            contents: messages.length
              ? messages.map((value) => {
                const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
                return { role: row.role === "assistant" ? "model" : "user", parts: [{ text: contentText(row.content) }] };
              })
              : [{ parts: [{ text: prompt }] }],
          };
        delete body.question;
        delete body.prompt;
        delete body.model;
        delete body.messages;
      }
      let path = replaceTokens(model.submitPath, { model: nativeId, voiceId: "" });
      if (model.protocol === "gemini-generate") {
        path = path.replace(":generateContent", ":streamGenerateContent");
        path += path.includes("?") ? "&alt=sse" : "?alt=sse";
      }
      onChunk({ event: "connected" });
      const response = await this.requestRaw(definition, path, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      }, 180_000);
      if (!response.ok) {
        const responseBody = await decodeResponse(response);
        const error = responseMessage(responseBody, `HTTP ${response.status}`);
        onChunk({ event: "error", error });
        return { success: false, status: response.status, data: responseBody, error };
      }
      const text = await consumeTextStream(response, (delta, kind) => onChunk({ event: kind === "reasoning" ? "reasoning" : "delta", delta }));
      if (!text) {
        const error = "模型平台未返回可显示的文本内容";
        onChunk({ event: "error", error });
        return { success: false, status: response.status, error };
      }
      onChunk({ event: "done" });
      return { success: true, status: response.status, data: { text } };
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "已停止生成"
        : error instanceof DOMException && error.name === "TimeoutError"
          ? "模型平台响应超时（180 秒）"
          : error instanceof Error ? error.message : "流式请求失败";
      onChunk({ event: "error", error: message });
      return { success: false, status: 0, error: message };
    }
  }

  async status(modelId: string, taskId: string, useRoute = false, operation?: string): Promise<GenerationResponse> {
    const definition = providerForModel(modelId);
    if (!definition || definition.id === "ai-task-mcp") return this.aiTask.status(modelId, taskId, useRoute, operation);
    const model = await this.resolveModel(modelId);
    if (!model?.statusPath) return { success: false, status: 0, error: "该原生接口同步返回结果或尚未声明状态端点" };
    try {
      const { response, body } = await this.request(definition, replaceTokens(model.statusPath, { taskId }));
      return { success: response.ok, status: response.status, data: body, error: response.ok ? undefined : responseMessage(body, `HTTP ${response.status}`) };
    } catch (error) {
      return { success: false, status: 0, error: error instanceof Error ? error.message : "查询失败" };
    }
  }
}
