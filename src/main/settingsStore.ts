import { app, safeStorage } from "electron";
import { cp, readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { PROVIDER_BY_ID, PROVIDER_CATALOG } from "../shared/providerCatalog";
import type {
  AppSettings,
  MenuPlugin,
  ProviderProfile,
  ProviderSaveInput,
  ProviderState,
  SecretStatus,
} from "../shared/types";

const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: "https://ai-mcp.wuread.cn",
  userId: 1,
  userName: "AIYOU User",
  codexCommand: "codex",
  theme: "system",
  approvalPolicy: "on-request",
  sandbox: "workspace-write",
  defaultModels: {
    text: "codex",
    image: "seedream-4.5",
    audio: "seed-tts-2.0",
    video: "seedance-2.5",
    processing: "vod-enhance",
  },
};

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export class SettingsStore {
  private get settingsPath() {
    return join(app.getPath("userData"), "settings.json");
  }

  async get(): Promise<AppSettings> {
    const saved = await readJson<Partial<AppSettings>>(this.settingsPath, {});
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      defaultModels: {
        ...DEFAULT_SETTINGS.defaultModels,
        ...(saved.defaultModels ?? {}),
      },
    };
  }

  async set(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.get();
    const next = { ...current, ...patch };
    await writeJson(this.settingsPath, next);
    return next;
  }
}

type EncryptedProviderSecrets = {
  version: 1;
  providers: Record<string, Record<string, string>>;
};

type ProviderProfiles = {
  version: 1;
  providers: Record<string, Partial<ProviderProfile>>;
};

export class ProviderStore {
  private get profilePath() {
    return join(app.getPath("userData"), "provider-profiles.json");
  }

  private get secretPath() {
    return join(app.getPath("userData"), "provider-secrets.json");
  }

  private get legacySecretPath() {
    return join(app.getPath("userData"), "ai-task-key.json");
  }

  private async migrateLegacy() {
    const current = await readJson<EncryptedProviderSecrets>(this.secretPath, { version: 1, providers: {} });
    if (current.providers["ai-task-mcp"]?.apiKey) return current;
    const legacy = await readJson<{ ciphertext?: string }>(this.legacySecretPath, {});
    if (!legacy.ciphertext) return current;
    current.providers["ai-task-mcp"] = { apiKey: legacy.ciphertext };
    await writeJson(this.secretPath, current);
    return current;
  }

  async profile(providerId: string): Promise<ProviderProfile> {
    const definition = PROVIDER_BY_ID.get(providerId);
    if (!definition) throw new Error(`未知模型平台：${providerId}`);
    const records = await readJson<ProviderProfiles>(this.profilePath, { version: 1, providers: {} });
    const saved = records.providers[providerId] ?? {};
    return {
      providerId,
      enabled: saved.enabled ?? providerId === "ai-task-mcp",
      baseUrl: saved.baseUrl?.trim() || definition.defaultBaseUrl,
      values: saved.values ?? {},
    };
  }

  async status(providerId: string): Promise<ProviderState> {
    const definition = PROVIDER_BY_ID.get(providerId);
    if (!definition) throw new Error(`未知模型平台：${providerId}`);
    const [profile, secrets] = await Promise.all([this.profile(providerId), this.migrateLegacy()]);
    const secretFields = definition.credentialFields.filter((item) => item.secret !== false);
    const nonSecretFields = definition.credentialFields.filter((item) => item.secret === false);
    const credentialStatus = Object.fromEntries(definition.credentialFields.map((item) => [
      item.id,
      item.secret === false
        ? Boolean(profile.values[item.id]?.trim())
        : Boolean(secrets.providers[providerId]?.[item.id]),
    ]));
    const required = definition.credentialFields.filter((item) => item.required !== false);
    const configured = required.length === 0 || required.every((item) => credentialStatus[item.id]);
    return {
      ...definition,
      profile,
      credentialStatus,
      configured,
      encryptionAvailable: secretFields.length === 0 || safeStorage.isEncryptionAvailable(),
    };
  }

  async list(): Promise<ProviderState[]> {
    return Promise.all(PROVIDER_CATALOG.map((item) => this.status(item.id)));
  }

  async save(input: ProviderSaveInput): Promise<ProviderState> {
    const definition = PROVIDER_BY_ID.get(input.providerId);
    if (!definition) throw new Error(`未知模型平台：${input.providerId}`);
    const profiles = await readJson<ProviderProfiles>(this.profilePath, { version: 1, providers: {} });
    const current = await this.profile(input.providerId);
    const baseUrl = input.baseUrl?.trim() || current.baseUrl;
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
      if (parsed.username || parsed.password) throw new Error();
    } catch {
      throw new Error("服务地址必须是无内嵌凭证的有效 HTTP/HTTPS URL");
    }
    const nextValues = { ...current.values };
    for (const [key, value] of Object.entries(input.values ?? {})) {
      if (definition.credentialFields.some((item) => item.id === key && item.secret === false)) {
        nextValues[key] = value.trim();
      }
    }
    profiles.providers[input.providerId] = {
      providerId: input.providerId,
      enabled: input.enabled ?? current.enabled,
      baseUrl,
      values: nextValues,
    };
    await writeJson(this.profilePath, profiles);

    const credentialEntries = Object.entries(input.credentials ?? {}).filter(([, value]) => value.trim());
    if (credentialEntries.length) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("系统安全凭据服务当前不可用，已拒绝明文保存凭证");
      }
      const secrets = await this.migrateLegacy();
      const providerSecrets = { ...(secrets.providers[input.providerId] ?? {}) };
      for (const [key, value] of credentialEntries) {
        const known = definition.credentialFields.some((item) => item.id === key && item.secret !== false);
        if (!known) continue;
        providerSecrets[key] = safeStorage.encryptString(value.trim()).toString("base64");
      }
      secrets.providers[input.providerId] = providerSecrets;
      await writeJson(this.secretPath, secrets);
    }
    return this.status(input.providerId);
  }

  async readCredentials(providerId: string): Promise<Record<string, string>> {
    const [profile, secrets] = await Promise.all([this.profile(providerId), this.migrateLegacy()]);
    const result: Record<string, string> = { ...profile.values };
    if (!safeStorage.isEncryptionAvailable()) return result;
    for (const [key, ciphertext] of Object.entries(secrets.providers[providerId] ?? {})) {
      try {
        result[key] = safeStorage.decryptString(Buffer.from(ciphertext, "base64"));
      } catch {
        // A corrupt or machine-bound ciphertext is treated as unavailable.
      }
    }
    return result;
  }

  async removeCredentials(providerId: string): Promise<ProviderState> {
    const secrets = await this.migrateLegacy();
    delete secrets.providers[providerId];
    await writeJson(this.secretPath, secrets);
    if (providerId === "ai-task-mcp") {
      try {
        await unlink(this.legacySecretPath);
      } catch {
        // Missing legacy secret is already the desired state.
      }
    }
    return this.status(providerId);
  }
}

export class SecretStore {
  constructor(private readonly providers = new ProviderStore()) {}

  async status(): Promise<SecretStatus> {
    const state = await this.providers.status("ai-task-mcp");
    return {
      configured: state.configured,
      encryptionAvailable: state.encryptionAvailable,
      maskedValue: state.configured ? "••••••••••••" : undefined,
    };
  }

  async save(value: string): Promise<SecretStatus> {
    const key = value.trim();
    if (!key) throw new Error("API Key 不能为空");
    await this.providers.save({ providerId: "ai-task-mcp", enabled: true, credentials: { apiKey: key } });
    return this.status();
  }

  async read(): Promise<string | null> {
    return (await this.providers.readCredentials("ai-task-mcp")).apiKey ?? null;
  }

  async baseUrl(fallback: string) {
    return (await this.providers.profile("ai-task-mcp")).baseUrl || fallback;
  }

  async remove(): Promise<SecretStatus> {
    await this.providers.removeCredentials("ai-task-mcp");
    return this.status();
  }
}

const BUILT_IN_PLUGINS: MenuPlugin[] = [
  { id: "projects", name: "项目管理", description: "按工作区查看 Codex 任务", icon: "blocks", group: "workspace", placement: "both", enabled: true, builtIn: true, source: "built-in", command: "projects", shortcut: "⌘2" },
  { id: "skills", name: "Skills 分组", description: "浏览已安装的 Skills 与能力", icon: "skills", group: "developer", placement: "both", enabled: true, builtIn: true, source: "built-in", command: "skills", shortcut: "⌘3" },
  { id: "assets", name: "资产控制台", description: "集中查看生成结果和媒体资产", icon: "assets", group: "creative", placement: "both", enabled: true, builtIn: true, source: "built-in", command: "assets", shortcut: "⌘4" },
  { id: "automation", name: "自动执行", description: "查看自动化与周期任务", icon: "automation", group: "workspace", placement: "menu", enabled: true, builtIn: true, source: "built-in", command: "automation" },
  { id: "developer", name: "开发者工具", description: "打开 AIYOU Provider 与插件文档", icon: "terminal", group: "developer", placement: "menu", enabled: true, builtIn: true, source: "built-in", command: "open-url", url: "https://platform.openai.com/docs" },
];

type CodexPluginManifest = {
  name?: string;
  version?: string;
  description?: string;
  homepage?: string;
  author?: { name?: string };
  skills?: string;
  mcpServers?: string | Record<string, unknown>;
  apps?: string;
  interface?: {
    displayName?: string;
    shortDescription?: string;
    capabilities?: string[];
  };
};

function safePluginPath(root: string, path: string) {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel === "." || (!rel.startsWith("..") && !isAbsolute(rel))) return target;
  throw new Error("插件清单包含越界路径");
}

function validatePluginManifest(manifest: CodexPluginManifest, folderName?: string) {
  if (!manifest.name || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(manifest.name)) throw new Error("插件 name 不合法");
  if (folderName && manifest.name !== folderName) throw new Error("插件目录名必须与 plugin.json name 一致");
  if (!manifest.version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) throw new Error("插件 version 必须是 semver");
  if (!manifest.description?.trim()) throw new Error("插件缺少 description");
  if (!manifest.author?.name?.trim()) throw new Error("插件缺少 author.name");
  if (!manifest.interface?.displayName?.trim() || !manifest.interface.shortDescription?.trim()) throw new Error("插件缺少 interface 展示信息");
}

export class PluginStore {
  private get pluginPath() {
    return join(app.getPath("userData"), "menu-plugins.json");
  }

  async directory() {
    const path = join(app.getPath("userData"), "plugins");
    await mkdir(path, { recursive: true });
    return path;
  }

  private async legacyPlugins(): Promise<MenuPlugin[]> {
    const directory = await this.directory();
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
    const manifests = await Promise.all(names.map((name) => readJson<Partial<MenuPlugin> | null>(join(directory, name), null)));
    return manifests.flatMap((manifest) => {
      if (!manifest?.id || !manifest.name || !manifest.description || !manifest.icon || !manifest.group || !manifest.placement || !manifest.command) return [];
      if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(manifest.id)) return [];
      if (BUILT_IN_PLUGINS.some((item) => item.id === manifest.id)) return [];
      if (!["blocks", "skills", "assets", "automation", "terminal", "link"].includes(manifest.icon)) return [];
      if (!["workspace", "creative", "developer"].includes(manifest.group)) return [];
      if (!["quick", "menu", "both"].includes(manifest.placement)) return [];
      if (!["new-task", "projects", "skills", "assets", "automation", "open-url", "plugin"].includes(manifest.command)) return [];
      if (manifest.command === "open-url" && (!manifest.url || !/^https?:\/\//.test(manifest.url))) return [];
      return [{
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        icon: manifest.icon,
        group: manifest.group,
        placement: manifest.placement,
        enabled: manifest.enabled ?? true,
        builtIn: false,
        source: "legacy" as const,
        command: manifest.command,
        url: manifest.url,
        shortcut: manifest.shortcut,
      }];
    });
  }

  private async codexPlugins(): Promise<MenuPlugin[]> {
    const directory = await this.directory();
    const entries = await readdir(directory, { withFileTypes: true });
    const result: MenuPlugin[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const root = join(directory, entry.name);
      const manifest = await readJson<CodexPluginManifest | null>(join(root, ".codex-plugin", "plugin.json"), null);
      if (!manifest) continue;
      try {
        validatePluginManifest(manifest, entry.name);
        const skillsPath = manifest.skills ? safePluginPath(root, manifest.skills) : undefined;
        result.push({
          id: manifest.name!,
          name: manifest.interface!.displayName!,
          description: manifest.interface!.shortDescription || manifest.description!,
          icon: manifest.skills ? "skills" : manifest.mcpServers || manifest.apps ? "blocks" : "link",
          group: manifest.skills || manifest.mcpServers || manifest.apps ? "developer" : "workspace",
          placement: "menu",
          enabled: true,
          builtIn: false,
          source: "codex-plugin",
          command: "plugin",
          url: manifest.homepage,
          version: manifest.version,
          installedPath: root,
          skillsPath,
          capabilities: manifest.interface?.capabilities ?? [
            ...(manifest.skills ? ["Skills"] : []),
            ...(manifest.mcpServers ? ["MCP"] : []),
            ...(manifest.apps ? ["Apps"] : []),
          ],
        });
      } catch {
        // Invalid bundles are intentionally omitted from executable plugin state.
      }
    }
    return result;
  }

  async list(): Promise<MenuPlugin[]> {
    const overrides = await readJson<Record<string, Partial<MenuPlugin>>>(this.pluginPath, {});
    const items = [...BUILT_IN_PLUGINS, ...(await this.legacyPlugins()), ...(await this.codexPlugins())];
    return items.map((item) => ({ ...item, ...(overrides[item.id] ?? {}), id: item.id, builtIn: item.builtIn }));
  }

  async install(sourceDirectory: string) {
    const manifest = await readJson<CodexPluginManifest | null>(join(sourceDirectory, ".codex-plugin", "plugin.json"), null);
    if (!manifest) throw new Error("所选目录缺少 .codex-plugin/plugin.json");
    validatePluginManifest(manifest, basename(sourceDirectory));
    if (manifest.skills) safePluginPath(sourceDirectory, manifest.skills);
    if (typeof manifest.mcpServers === "string") safePluginPath(sourceDirectory, manifest.mcpServers);
    if (manifest.apps) safePluginPath(sourceDirectory, manifest.apps);
    const directory = await this.directory();
    const target = join(directory, manifest.name!);
    if ((await readdir(directory)).includes(manifest.name!)) throw new Error("该插件已经安装，请先卸载旧版本");
    await cp(sourceDirectory, target, { recursive: true, errorOnExist: true, force: false });
    return this.list();
  }

  async uninstallPath(pluginId: string) {
    const plugin = (await this.list()).find((item) => item.id === pluginId);
    if (!plugin || plugin.builtIn || plugin.source !== "codex-plugin" || !plugin.installedPath) throw new Error("该插件不可卸载");
    const directory = await this.directory();
    safePluginPath(directory, plugin.installedPath);
    return plugin.installedPath;
  }

  async setEnabled(pluginId: string, enabled: boolean) {
    if (!(await this.list()).some((item) => item.id === pluginId)) throw new Error(`未知插件：${pluginId}`);
    const overrides = await readJson<Record<string, Partial<MenuPlugin>>>(this.pluginPath, {});
    overrides[pluginId] = { ...(overrides[pluginId] ?? {}), enabled };
    await writeJson(this.pluginPath, overrides);
    return this.list();
  }
}
