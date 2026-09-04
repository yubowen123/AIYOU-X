import { MODEL_CATALOG } from "../shared/modelCatalog";
import { resolveStatusPath, resolveSubmitRequest } from "../shared/requestRouter";
import type {
  ConnectionTest,
  GenerationRequest,
  GenerationResponse,
  ModelDefinition,
} from "../shared/types";
import type { SecretStore, SettingsStore } from "./settingsStore";

type ApiEnvelope = {
  success?: boolean;
  data?: unknown;
  message?: string;
  error?: string;
};

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

async function decodeResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as ApiEnvelope;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

export class AiTaskClient {
  constructor(
    private readonly settings: SettingsStore,
    private readonly secrets: SecretStore,
  ) {}

  private async auth() {
    const key = await this.secrets.read();
    if (!key) throw new Error("请先在设置中配置 AI Task MCP API Key");
    return key;
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<{ response: Response; body: ApiEnvelope }> {
    const [settings, key] = await Promise.all([this.settings.get(), this.auth()]);
    const baseUrl = await this.secrets.baseUrl(settings.baseUrl);
    const headers = new Headers(init.headers);
    headers.set("X-API-Key", key);
    headers.set("Authorization", `Bearer ${key}`);
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`${cleanBaseUrl(baseUrl)}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    return { response, body: await decodeResponse(response) };
  }

  async test(): Promise<ConnectionTest> {
    try {
      const { response, body } = await this.request("/api/v1/video/models");
      const models = Array.isArray(body.data) ? body.data : [];
      return {
        ok: response.ok && body.success !== false,
        status: response.status,
        message: response.ok
          ? "平台与模型目录可访问，Key 有效；尚未调用付费模型验证每个上游通道"
          : body.message ?? body.error ?? "Key 校验失败",
        modelCount: models.length || undefined,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        message: error instanceof Error ? error.message : "连接失败",
      };
    }
  }

  async listModels(): Promise<ModelDefinition[]> {
    return MODEL_CATALOG;
  }

  async refreshModels(): Promise<ModelDefinition[]> {
    try {
      const { response, body } = await this.request("/api/v1/video/models");
      if (!response.ok || !Array.isArray(body.data)) return MODEL_CATALOG;
      const live = new Map(
        body.data
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
          .map((item) => [String(item.id ?? ""), item]),
      );
      return MODEL_CATALOG.map((model) => {
        const metadata = live.get(model.id);
        if (!metadata) return model;
        const supportedDurations = Array.isArray(metadata.supportedDurations)
          ? metadata.supportedDurations.join("/") + "s"
          : model.duration;
        return {
          ...model,
          name: typeof metadata.name === "string" ? metadata.name : model.name,
          duration: supportedDurations,
        };
      });
    } catch {
      return MODEL_CATALOG;
    }
  }

  async submit(request: GenerationRequest): Promise<GenerationResponse> {
    try {
      const resolved = resolveSubmitRequest(request.model, request.payload, request.useRoute);
      const { response, body } = await this.request(resolved.path, {
        method: resolved.method,
        body: JSON.stringify(resolved.body),
      });
      return {
        success: response.ok && body.success !== false,
        status: response.status,
        data: body.data ?? body,
        error: response.ok ? undefined : body.message ?? body.error ?? `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        status: 0,
        error: error instanceof Error ? error.message : "请求失败",
      };
    }
  }

  async status(model: string, taskId: string, useRoute = false, operation?: string): Promise<GenerationResponse> {
    try {
      const path = resolveStatusPath(model, taskId, useRoute, operation);
      const { response, body } = await this.request(path);
      return {
        success: response.ok && body.success !== false,
        status: response.status,
        data: body.data ?? body,
        error: response.ok ? undefined : body.message ?? body.error ?? `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        status: 0,
        error: error instanceof Error ? error.message : "查询失败",
      };
    }
  }
}
