import { getModel } from "./modelCatalog";

export type ResolvedRequest = {
  path: string;
  body: Record<string, unknown>;
  method: "GET" | "POST";
};

const AUDIO_CLONE_PATH = "/api/v1/audio/voice/clone";
const AUDIO_CLONE_STATUS = "/api/v1/audio/voice/clone/status/{taskId}";

export function sanitizePayload(payload: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

export function resolveSubmitRequest(
  modelId: string,
  payload: Record<string, unknown>,
  useRoute = false,
): ResolvedRequest {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  const body = sanitizePayload({ ...payload, model: modelId });
  const operation = body.operation;
  delete body.operation;

  if (useRoute && model.category === "video") {
    body.modelName = modelId;
    delete body.model;
    return {
      path: "/api/v1/model-route/video/generate",
      method: "POST",
      body,
    };
  }

  if (model.category === "audio" && operation === "clone") {
    return { path: AUDIO_CLONE_PATH, method: "POST", body };
  }

  if (model.protocol === "chat-completions") {
    const messages = Array.isArray(body.messages)
      ? body.messages
      : [{ role: "user", content: String(body.question ?? body.prompt ?? "") }];
    return {
      path: model.submitPath,
      method: "POST",
      body: sanitizePayload({ ...body, messages, stream: body.stream ?? false }),
    };
  }

  if (model.protocol === "responses") {
    const input = body.input ?? body.question ?? body.prompt ?? "";
    delete body.question;
    delete body.prompt;
    return {
      path: model.submitPath,
      method: "POST",
      body: sanitizePayload({ ...body, input, stream: body.stream ?? false }),
    };
  }

  return { path: model.submitPath, method: "POST", body };
}

export function resolveStatusPath(
  modelId: string,
  taskId: string,
  useRoute = false,
  operation?: string,
) {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  if (useRoute && model.category === "video") {
    return `/api/v1/model-route/video/status/${encodeURIComponent(taskId)}`;
  }
  const path = model.category === "audio" && operation === "clone"
    ? AUDIO_CLONE_STATUS
    : model.statusPath;
  if (!path) throw new Error(`${modelId} uses a synchronous/streaming protocol`);
  return path.replace("{taskId}", encodeURIComponent(taskId));
}
