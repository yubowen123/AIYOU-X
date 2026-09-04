import { contextBridge, ipcRenderer } from "electron";
import type { ApprovalRequest, CodexEvent, GenerationStreamChunk } from "../shared/types";
import type { HarnessApi } from "../shared/api";

let activeGenerationRequestId: string | null = null;

const api: HarnessApi = {
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch) => ipcRenderer.invoke("settings:set", patch),
  },
  secrets: {
    status: () => ipcRenderer.invoke("secrets:status"),
    save: (key) => ipcRenderer.invoke("secrets:save", key),
    remove: () => ipcRenderer.invoke("secrets:remove"),
    test: () => ipcRenderer.invoke("secrets:test"),
  },
  providers: {
    list: () => ipcRenderer.invoke("providers:list"),
    save: (input) => ipcRenderer.invoke("providers:save", input),
    removeCredentials: (providerId) => ipcRenderer.invoke("providers:removeCredentials", providerId),
    test: (providerId) => ipcRenderer.invoke("providers:test", providerId),
  },
  plugins: {
    list: () => ipcRenderer.invoke("plugins:list"),
    setEnabled: (pluginId, enabled) => ipcRenderer.invoke("plugins:setEnabled", pluginId, enabled),
    openFolder: () => ipcRenderer.invoke("plugins:openFolder"),
    install: () => ipcRenderer.invoke("plugins:install"),
    uninstall: (pluginId) => ipcRenderer.invoke("plugins:uninstall", pluginId),
  },
  skills: {
    list: (cwd, forceReload) => ipcRenderer.invoke("skills:list", cwd, forceReload),
    setEnabled: (skill, enabled) => ipcRenderer.invoke("skills:setEnabled", skill, enabled),
    openFolder: (path) => ipcRenderer.invoke("skills:openFolder", path),
  },
  models: {
    list: () => ipcRenderer.invoke("models:list"),
    refresh: (providerId) => ipcRenderer.invoke("models:refresh", providerId),
  },
  generation: {
    submit: (request) => ipcRenderer.invoke("generation:submit", request),
    stream: async (request, onChunk) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeGenerationRequestId = requestId;
      const handler = (_event: Electron.IpcRendererEvent, chunk: GenerationStreamChunk) => {
        if (chunk.requestId === requestId) onChunk(chunk);
      };
      ipcRenderer.on("generation:stream:chunk", handler);
      try {
        return await ipcRenderer.invoke("generation:stream", requestId, request);
      } finally {
        ipcRenderer.removeListener("generation:stream:chunk", handler);
        if (activeGenerationRequestId === requestId) activeGenerationRequestId = null;
      }
    },
    cancelStream: async () => {
      if (activeGenerationRequestId) await ipcRenderer.invoke("generation:stream:cancel", activeGenerationRequestId);
    },
    status: (model, taskId, useRoute, operation) =>
      ipcRenderer.invoke("generation:status", model, taskId, useRoute, operation),
    tasks: () => ipcRenderer.invoke("generation:tasks"),
    cancelTask: (taskId) => ipcRenderer.invoke("generation:task:cancel", taskId),
    openExternal: (url) => ipcRenderer.invoke("generation:openExternal", url),
  },
  codex: {
    status: () => ipcRenderer.invoke("codex:status"),
    start: () => ipcRenderer.invoke("codex:start"),
    stop: () => ipcRenderer.invoke("codex:stop"),
    listThreads: (cwd) => ipcRenderer.invoke("codex:listThreads", cwd),
    readThread: (threadId) => ipcRenderer.invoke("codex:readThread", threadId),
    resumeThread: (threadId) => ipcRenderer.invoke("codex:resumeThread", threadId),
    startThread: (input) => ipcRenderer.invoke("codex:startThread", input),
    startTurn: (input) => ipcRenderer.invoke("codex:startTurn", input),
    steerTurn: (threadId, turnId, input) => ipcRenderer.invoke("codex:steerTurn", threadId, turnId, input),
    interrupt: (threadId, turnId) => ipcRenderer.invoke("codex:interrupt", threadId, turnId),
    archiveThread: (threadId) => ipcRenderer.invoke("codex:archiveThread", threadId),
    unarchiveThread: (threadId) => ipcRenderer.invoke("codex:unarchiveThread", threadId),
    setThreadPinned: (threadId, pinned) => ipcRenderer.invoke("codex:setThreadPinned", threadId, pinned),
    setThreadName: (threadId, name) => ipcRenderer.invoke("codex:setThreadName", threadId, name),
    runtimeCapabilities: (cwd) => ipcRenderer.invoke("codex:runtimeCapabilities", cwd),
    resolveApproval: (id, result) => ipcRenderer.invoke("codex:resolveApproval", id, result),
    chooseWorkspace: () => ipcRenderer.invoke("codex:chooseWorkspace"),
    chooseAttachments: () => ipcRenderer.invoke("codex:chooseAttachments"),
    onEvent: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, value: CodexEvent) => callback(value);
      ipcRenderer.on("codex:event", handler);
      return () => ipcRenderer.removeListener("codex:event", handler);
    },
    onApproval: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, value: ApprovalRequest) => callback(value);
      ipcRenderer.on("codex:approval", handler);
      return () => ipcRenderer.removeListener("codex:approval", handler);
    },
  },
};

contextBridge.exposeInMainWorld("harness", api);
