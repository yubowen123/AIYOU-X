import type {
  RuntimeSkillsSnapshot,
  SkillListEntry,
  SkillMetadata,
  SkillScope,
  SkillSource,
} from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedPath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function isInside(path: string, root: string) {
  const target = normalizedPath(path);
  const parent = normalizedPath(root);
  return target === parent || target.startsWith(`${parent}/`);
}

function skillScope(value: unknown): SkillScope {
  return value === "repo" || value === "system" || value === "admin" ? value : "user";
}

function parseSkill(value: unknown, pluginRoots: string[]): SkillMetadata | null {
  const item = record(value);
  if (typeof item.name !== "string" || typeof item.path !== "string") return null;
  const scope = skillScope(item.scope);
  const source: SkillSource = pluginRoots.some((root) => isInside(item.path as string, root)) ? "plugin" : scope;
  const skillInterface = record(item.interface);
  const dependencies = record(item.dependencies);
  const tools = Array.isArray(dependencies.tools)
    ? dependencies.tools.flatMap((tool) => {
      const row = record(tool);
      if (typeof row.type !== "string" || typeof row.value !== "string") return [];
      return [{
        type: row.type,
        value: row.value,
        command: typeof row.command === "string" ? row.command : null,
        description: typeof row.description === "string" ? row.description : null,
        transport: typeof row.transport === "string" ? row.transport : null,
        url: typeof row.url === "string" ? row.url : null,
      }];
    })
    : [];
  const displayName = typeof skillInterface.displayName === "string" && skillInterface.displayName.trim()
    ? skillInterface.displayName.trim()
    : item.name;
  return {
    name: item.name,
    path: item.path,
    displayName,
    description: typeof item.description === "string" ? item.description : "",
    shortDescription: typeof item.shortDescription === "string" ? item.shortDescription : null,
    scope,
    source,
    enabled: item.enabled !== false,
    interface: Object.keys(skillInterface).length ? {
      displayName: typeof skillInterface.displayName === "string" ? skillInterface.displayName : null,
      shortDescription: typeof skillInterface.shortDescription === "string" ? skillInterface.shortDescription : null,
      iconSmall: typeof skillInterface.iconSmall === "string" ? skillInterface.iconSmall : null,
      iconLarge: typeof skillInterface.iconLarge === "string" ? skillInterface.iconLarge : null,
      brandColor: typeof skillInterface.brandColor === "string" ? skillInterface.brandColor : null,
      defaultPrompt: typeof skillInterface.defaultPrompt === "string" ? skillInterface.defaultPrompt : null,
    } : null,
    dependencies: Object.keys(dependencies).length ? { tools } : null,
  };
}

/** Converts the native Codex `skills/list` response without discarding cwd groups or scan errors. */
export function parseSkillsListResponse(value: unknown, pluginRoots: string[] = []): RuntimeSkillsSnapshot {
  const response = record(value);
  const data = Array.isArray(response.data) ? response.data : [];
  const skillGroups: SkillListEntry[] = data.map((rawGroup) => {
    const group = record(rawGroup);
    const cwd = typeof group.cwd === "string" ? group.cwd : "";
    const skills = Array.isArray(group.skills)
      ? group.skills.flatMap((skill) => {
        const parsed = parseSkill(skill, pluginRoots);
        return parsed ? [parsed] : [];
      })
      : [];
    const errors = Array.isArray(group.errors)
      ? group.errors.flatMap((rawError) => {
        const error = record(rawError);
        if (typeof error.path !== "string" || typeof error.message !== "string") return [];
        return [{ cwd, path: error.path, message: error.message }];
      })
      : [];
    return { cwd, skills, errors };
  });
  return {
    skills: skillGroups.flatMap((group) => group.skills),
    skillGroups,
    skillErrors: skillGroups.flatMap((group) => group.errors),
    loadedAt: Date.now(),
  };
}

export function skillDisplayName(skill: Pick<SkillMetadata, "name" | "displayName" | "interface">) {
  return skill.interface?.displayName?.trim() || skill.displayName?.trim() || skill.name;
}

export const SKILL_SOURCE_LABELS: Record<SkillSource, string> = {
  plugin: "插件",
  user: "用户",
  repo: "工作区",
  system: "系统",
  admin: "管理员",
};
