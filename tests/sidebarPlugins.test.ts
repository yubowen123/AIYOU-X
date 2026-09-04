import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Codex-inspired navigator and menu plugins", () => {
  it("renders live project filters and thread cards", () => {
    const app = readFileSync(resolve("src/renderer/App.tsx"), "utf8");
    expect(app).toContain("projectPaths");
    expect(app).toContain("visibleThreads.slice");
    expect(app).toContain("thread-filter-tabs");
    expect(app).toContain("thread-card-list");
  });

  it("exposes persisted plugin management through isolated IPC", () => {
    const api = readFileSync(resolve("src/shared/api.ts"), "utf8");
    const preload = readFileSync(resolve("src/preload/preload.ts"), "utf8");
    const store = readFileSync(resolve("src/main/settingsStore.ts"), "utf8");
    expect(api).toContain("plugins:");
    expect(preload).toContain('ipcRenderer.invoke("plugins:list")');
    expect(store).toContain("codexPlugins");
    expect(store).toContain(".codex-plugin");
    expect(store).toContain("menu-plugins.json");
  });

  it("opens a visible plugin workspace instead of a notice-only branch", () => {
    const app = readFileSync(resolve("src/renderer/App.tsx"), "utf8");
    const panel = readFileSync(resolve("src/renderer/components/PluginPanel.tsx"), "utf8");
    expect(app).toContain("setActivePlugin(plugin)");
    expect(app).toContain("<PluginPanel");
    expect(panel).toContain("生成任务生命周期");
    expect(panel).toContain("重新扫描");
    expect(panel).toContain("用于当前任务");
    expect(panel).toContain("暂无自动化任务");
  });

  it("routes third-party LLMs through the same Codex Agent Runtime", () => {
    const app = readFileSync(resolve("src/renderer/App.tsx"), "utf8");
    expect(app).toContain('modelProvider: "aiyou"');
    expect(app).toContain("window.harness.codex.startTurn");
    expect(app).toContain("window.harness.codex.interrupt");
    expect(app).not.toContain("window.harness.generation.stream");
    expect(app).not.toContain("externalMessages");
  });

  it("exposes a first-class Skills lifecycle instead of a count-only panel", () => {
    const api = readFileSync(resolve("src/shared/api.ts"), "utf8");
    const preload = readFileSync(resolve("src/preload/preload.ts"), "utf8");
    const bridge = readFileSync(resolve("src/main/codexBridge.ts"), "utf8");
    const app = readFileSync(resolve("src/renderer/App.tsx"), "utf8");
    const panel = readFileSync(resolve("src/renderer/components/PluginPanel.tsx"), "utf8");
    const thread = readFileSync(resolve("src/renderer/components/ThreadContent.tsx"), "utf8");
    expect(api).toContain("skills:");
    expect(preload).toContain('ipcRenderer.invoke("skills:setEnabled"');
    expect(bridge).toContain('this.request("skills/config/write"');
    expect(bridge).toContain('this.request("skills/list"');
    expect(app).toContain("<SkillPicker");
    expect(app).toContain("selectedSkills");
    expect(panel).toContain("用于当前任务");
    expect(panel).toContain("skillErrors");
    expect(panel).toContain("capabilities.skillGroups");
    expect(thread).toContain("user-content-skill");
    expect(thread).toContain("use_skill");
    expect(thread).toContain("Codex 原生 Skill 输入");
  });
});
