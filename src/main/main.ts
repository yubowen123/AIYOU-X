import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from "electron";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AiTaskClient } from "./aiTaskClient";
import { CodexBridge } from "./codexBridge";
import { PluginStore, ProviderStore, SecretStore, SettingsStore } from "./settingsStore";
import { ProviderClient } from "./providerClient";
import { ResponsesGateway } from "./responsesGateway";
import { GenerationTaskStore } from "./generationTaskStore";
import { isHttpUrl } from "../shared/utils";

let mainWindow: BrowserWindow | null = null;
const settingsStore = new SettingsStore();
const providerStore = new ProviderStore();
const secretStore = new SecretStore(providerStore);
const pluginStore = new PluginStore();
const aiTask = new AiTaskClient(settingsStore, secretStore);
const providers = new ProviderClient(providerStore, aiTask);
const codex = new CodexBridge();
const gateway = new ResponsesGateway(providers);
const generationTasks = new GenerationTaskStore();
const generationStreams = new Map<string, AbortController>();
const knownSkillPaths = new Set<string>();

function rememberSkillPaths(snapshot: { skills?: Array<{ path?: string }> }) {
  for (const skill of snapshot.skills ?? []) {
    if (typeof skill.path === "string") knownSkillPaths.add(skill.path);
  }
}

async function enabledSkillRoots() {
  return (await pluginStore.list())
    .filter((plugin) => plugin.enabled && plugin.skillsPath)
    .map((plugin) => plugin.skillsPath!);
}

function configuredCodexCommand(command: string) {
  if (app.isPackaged && command === "codex") {
    return join(process.resourcesPath, "bin", process.platform === "win32" ? "codex.exe" : "codex");
  }
  return command;
}

function capturePath() {
  const index = process.argv.indexOf("--capture-ui");
  return process.env.AIYOU_CAPTURE_PATH ?? (index >= 0 ? process.argv[index + 1] : undefined);
}

function captureView() {
  const index = process.argv.indexOf("--capture-view");
  return process.env.AIYOU_CAPTURE_VIEW ?? (index >= 0 ? process.argv[index + 1] : undefined);
}

async function createWindow() {
  const preload = join(__dirname, "../preload/preload.cjs");
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    title: "AIYOU",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#171816" : "#f7f6f2",
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  const output = capturePath();
  if (output) {
    setTimeout(async () => {
      if (!mainWindow) return;
      const target = resolve(process.cwd(), output);
      await mkdir(dirname(target), { recursive: true });
      const image = await mainWindow.webContents.capturePage();
      const { writeFile } = await import("node:fs/promises");
      await writeFile(target, image.toPNG());
      app.quit();
    }, 3500);
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const view = captureView();
  if (devUrl) {
    const target = new URL(devUrl);
    if (view) target.searchParams.set("capture", view);
    await mainWindow.loadURL(target.toString());
  } else {
    const target = pathToFileURL(join(__dirname, "../../dist/index.html"));
    if (view) target.searchParams.set("capture", view);
    await mainWindow.loadURL(target.toString());
  }

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

}

function registerIpc() {
  ipcMain.handle("settings:get", () => settingsStore.get());
  ipcMain.handle("settings:set", async (_event, patch) => {
    const settings = await settingsStore.set(patch);
    nativeTheme.themeSource = settings.theme;
    return settings;
  });
  ipcMain.handle("secrets:status", () => secretStore.status());
  ipcMain.handle("secrets:save", (_event, key: string) => secretStore.save(key));
  ipcMain.handle("secrets:remove", () => secretStore.remove());
  ipcMain.handle("secrets:test", () => aiTask.test());
  ipcMain.handle("providers:list", () => providerStore.list());
  ipcMain.handle("providers:save", (_event, input) => providerStore.save(input));
  ipcMain.handle("providers:removeCredentials", (_event, providerId) => providerStore.removeCredentials(providerId));
  ipcMain.handle("providers:test", (_event, providerId) => providers.test(providerId));
  ipcMain.handle("plugins:list", () => pluginStore.list());
  ipcMain.handle("plugins:setEnabled", (_event, pluginId, enabled) => pluginStore.setEnabled(pluginId, enabled));
  ipcMain.handle("plugins:openFolder", async () => {
    const path = await pluginStore.directory();
    await shell.openPath(path);
    return path;
  });
  ipcMain.handle("plugins:install", async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { title: "选择 Codex 插件目录", properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ title: "选择 Codex 插件目录", properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return pluginStore.list();
    return pluginStore.install(result.filePaths[0]);
  });
  ipcMain.handle("plugins:uninstall", async (_event, pluginId: string) => {
    const path = await pluginStore.uninstallPath(pluginId);
    await shell.trashItem(path);
    return pluginStore.list();
  });
  ipcMain.handle("skills:list", async (_event, cwd?: string, forceReload = false) => {
    const settings = await settingsStore.get();
    if (!codex.status().connected) await codex.start(configuredCodexCommand(settings.codexCommand));
    const snapshot = await codex.listSkills(cwd, await enabledSkillRoots(), forceReload);
    rememberSkillPaths(snapshot);
    return snapshot;
  });
  ipcMain.handle("skills:setEnabled", async (_event, skill: { name?: string; path?: string }, enabled: boolean) => {
    if (!skill?.path || !knownSkillPaths.has(skill.path)) throw new Error("只能修改已由 Codex 发现的 Skill");
    return codex.setSkillEnabled({ name: skill.name ?? null, path: skill.path }, enabled);
  });
  ipcMain.handle("skills:openFolder", async (_event, path: string) => {
    if (!knownSkillPaths.has(path)) throw new Error("只能打开已由 Codex 发现的 Skill");
    shell.showItemInFolder(path);
  });
  ipcMain.handle("models:list", () => providers.listModels());
  ipcMain.handle("models:refresh", (_event, providerId) => providers.refreshModels(providerId));
  ipcMain.handle("generation:submit", async (_event, request) => {
    const model = await providers.model(request.model);
    if (!model) return { success: false, status: 0, error: `未知模型：${request.model}` };
    const task = await generationTasks.create(request, model);
    const result = await providers.submit(request);
    const updated = await generationTasks.applyResponse(task.id, result);
    return { ...result, task: updated };
  });
  ipcMain.handle("generation:stream", async (event, requestId: string, request) => {
    const controller = new AbortController();
    generationStreams.set(requestId, controller);
    try {
      return await providers.stream(request, (chunk) => {
        if (!event.sender.isDestroyed()) event.sender.send("generation:stream:chunk", { requestId, ...chunk });
      }, controller.signal);
    } finally {
      generationStreams.delete(requestId);
    }
  });
  ipcMain.handle("generation:stream:cancel", (_event, requestId: string) => {
    generationStreams.get(requestId)?.abort();
  });
  ipcMain.handle("generation:status", async (_event, model, taskId, useRoute, operation) => {
    const result = await providers.status(model, taskId, useRoute, operation);
    const local = (await generationTasks.list()).find((item) => item.remoteTaskId === taskId && item.modelId === model);
    if (!local) return result;
    const updated = await generationTasks.applyResponse(local.id, result);
    return { ...result, task: updated };
  });
  ipcMain.handle("generation:tasks", () => generationTasks.list());
  ipcMain.handle("generation:task:cancel", (_event, taskId: string) => generationTasks.cancel(taskId));
  ipcMain.handle("generation:openExternal", async (_event, url: string) => {
    if (!isHttpUrl(url)) throw new Error("只允许打开 HTTP/HTTPS 地址");
    await shell.openExternal(url);
  });
  ipcMain.handle("codex:status", () => codex.status());
  ipcMain.handle("codex:start", async () => {
    const settings = await settingsStore.get();
    return codex.start(configuredCodexCommand(settings.codexCommand));
  });
  ipcMain.handle("codex:stop", () => codex.stop());
  ipcMain.handle("codex:listThreads", async (_event, query) => {
    const settings = await settingsStore.get();
    if (!codex.status().connected) await codex.start(configuredCodexCommand(settings.codexCommand));
    return codex.listThreads(query);
  });
  ipcMain.handle("codex:readThread", (_event, threadId: string) => codex.readThread(threadId));
  ipcMain.handle("codex:resumeThread", (_event, threadId: string) => codex.resumeThread(threadId));
  ipcMain.handle("codex:startThread", (_event, input) => codex.startThread(input));
  ipcMain.handle("codex:startTurn", (_event, input) => codex.startTurn(input));
  ipcMain.handle("codex:steerTurn", (_event, threadId, turnId, input) => codex.steerTurn(threadId, turnId, input));
  ipcMain.handle("codex:interrupt", (_event, threadId, turnId) => codex.interrupt(threadId, turnId));
  ipcMain.handle("codex:archiveThread", (_event, threadId) => codex.archiveThread(threadId));
  ipcMain.handle("codex:unarchiveThread", (_event, threadId) => codex.unarchiveThread(threadId));
  ipcMain.handle("codex:setThreadPinned", (_event, threadId, pinned) => codex.setThreadPinned(threadId, pinned));
  ipcMain.handle("codex:setThreadName", (_event, threadId, name) => codex.setThreadName(threadId, name));
  ipcMain.handle("codex:runtimeCapabilities", async (_event, cwd?: string) => {
    const settings = await settingsStore.get();
    if (!codex.status().connected) await codex.start(configuredCodexCommand(settings.codexCommand));
    const snapshot = await codex.runtimeCapabilities(cwd, await enabledSkillRoots());
    rememberSkillPaths(snapshot);
    return snapshot;
  });
  ipcMain.handle("codex:resolveApproval", (_event, id, result) => codex.resolveApproval(id, result));
  ipcMain.handle("codex:chooseWorkspace", async () => {
    const options: Electron.OpenDialogOptions = {
      title: "选择 AIYOU 工作区",
      properties: ["openDirectory", "createDirectory"],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("codex:chooseAttachments", async () => {
    const options: Electron.OpenDialogOptions = {
      title: "添加到 AIYOU 任务",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "支持的附件", extensions: ["png", "jpg", "jpeg", "webp", "gif", "md", "txt", "json", "ts", "tsx", "js", "jsx", "py", "toml", "yaml", "yml", "pdf"] },
        { name: "全部文件", extensions: ["*"] },
      ],
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return [];
    return result.filePaths.map((path) => {
      const image = /\.(png|jpe?g|webp|gif)$/i.test(path);
      return image
        ? { type: "localImage", path, name: path.split(/[\\/]/).pop() ?? path }
        : { type: "text", text: `请读取并结合附件文件：${path}`, path, name: path.split(/[\\/]/).pop() ?? path };
    });
  });

  codex.onEvent((event) => mainWindow?.webContents.send("codex:event", event));
  codex.onApproval((request) => mainWindow?.webContents.send("codex:approval", request));
}

app.whenReady().then(async () => {
  const settings = await settingsStore.get();
  nativeTheme.themeSource = settings.theme;
  registerIpc();
  codex.configureGateway(await gateway.start());
  await createWindow();
  void codex.start(configuredCodexCommand(settings.codexCommand)).catch(() => undefined);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void codex.stop();
  void gateway.stop();
});
