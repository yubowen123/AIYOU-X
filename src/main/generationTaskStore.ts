import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { GenerationRequest, GenerationResponse, GenerationTask, GenerationTaskStatus, ModelDefinition } from "../shared/types";

function firstString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  for (const key of keys) if (typeof row[key] === "string" && row[key]) return row[key] as string;
  for (const child of Object.values(row)) {
    if (!child || typeof child !== "object") continue;
    const match = firstString(child, keys);
    if (match) return match;
  }
  return undefined;
}

function promptFromRequest(request: GenerationRequest) {
  const source = request.payload;
  return String(source.prompt ?? source.question ?? source.text ?? "").slice(0, 4000);
}

function explicitRemoteStatus(value: unknown): GenerationTaskStatus | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  for (const key of ["status", "state", "taskStatus", "task_status"]) {
    if (typeof row[key] !== "string") continue;
    const status = row[key].toLowerCase().replace(/[\s-]+/g, "_");
    if (/cancel/.test(status)) return "canceled";
    if (/fail|error|reject/.test(status)) return "failed";
    if (/complete|success|succeed|done|finish/.test(status)) return "completed";
    if (/queue|pending|wait|submit/.test(status)) return "queued";
    if (/run|process|generat|progress/.test(status)) return "running";
  }
  for (const child of Object.values(row)) {
    const match = explicitRemoteStatus(child);
    if (match) return match;
  }
  return undefined;
}

export function generationStatusFromResponse(response: GenerationResponse): GenerationTaskStatus {
  if (!response.success) return "failed";
  const resultUrl = firstString(response.data, ["url", "videoUrl", "audioUrl", "imageUrl", "outputUrl"]);
  if (resultUrl) return "completed";
  const explicit = explicitRemoteStatus(response.data);
  if (explicit) return explicit;
  const remoteTaskId = firstString(response.data, ["taskId", "task_id", "id"]);
  return remoteTaskId ? "running" : "completed";
}

export class GenerationTaskStore {
  private get path() {
    return join(app.getPath("userData"), "generation-tasks.json");
  }

  private async read() {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8")) as unknown;
      return Array.isArray(value) ? value as GenerationTask[] : [];
    } catch {
      return [];
    }
  }

  private async write(tasks: GenerationTask[]) {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    await writeFile(temp, JSON.stringify(tasks.slice(0, 500), null, 2), { mode: 0o600 });
    await rename(temp, this.path);
  }

  async list() {
    return (await this.read()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async create(request: GenerationRequest, model: ModelDefinition): Promise<GenerationTask> {
    const now = Date.now();
    const task: GenerationTask = {
      id: randomUUID(),
      modelId: request.model,
      category: model.category,
      providerId: model.providerId,
      prompt: promptFromRequest(request),
      useRoute: request.useRoute,
      operation: typeof request.payload.operation === "string" ? request.payload.operation : undefined,
      status: "submitting",
      createdAt: now,
      updatedAt: now,
    };
    await this.write([task, ...(await this.read())]);
    return task;
  }

  async applyResponse(id: string, response: GenerationResponse): Promise<GenerationTask> {
    const tasks = await this.read();
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) throw new Error("生成任务不存在");
    const remoteTaskId = firstString(response.data, ["taskId", "task_id", "id"]);
    const resultUrl = firstString(response.data, ["url", "videoUrl", "audioUrl", "imageUrl", "outputUrl"]);
    const next: GenerationTask = {
      ...tasks[index],
      remoteTaskId: remoteTaskId ?? tasks[index].remoteTaskId,
      resultUrl: resultUrl ?? tasks[index].resultUrl,
      result: response.data,
      error: response.error,
      status: generationStatusFromResponse(response),
      updatedAt: Date.now(),
    };
    tasks[index] = next;
    await this.write(tasks);
    return next;
  }

  async cancel(id: string): Promise<GenerationTask> {
    const tasks = await this.read();
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) throw new Error("生成任务不存在");
    if (["completed", "failed", "canceled"].includes(tasks[index].status)) return tasks[index];
    tasks[index] = { ...tasks[index], status: "canceled", updatedAt: Date.now() };
    await this.write(tasks);
    return tasks[index];
  }
}
