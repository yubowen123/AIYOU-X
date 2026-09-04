import { describe, expect, it } from "vitest";
import { buildAgentInput } from "../src/renderer/agentInput";
import { failOptimisticTurn, optimisticTurn } from "../src/renderer/threadEvents";
import { parseSkillsListResponse } from "../src/shared/skills";
import type { CodexThread } from "../src/shared/types";

describe("Codex Skills runtime integration", () => {
  it("preserves cwd groups, discovery errors and plugin provenance", () => {
    const snapshot = parseSkillsListResponse({
      data: [{
        cwd: "/workspace",
        skills: [{
          name: "repo-review",
          description: "Review the repository",
          path: "/workspace/.agents/skills/repo-review/SKILL.md",
          scope: "repo",
          enabled: true,
          interface: { displayName: "Repository Review", defaultPrompt: "Review this workspace" },
          dependencies: { tools: [{ type: "mcp", value: "git" }] },
        }, {
          name: "plugin-skill",
          description: "Plugin supplied skill",
          path: "/plugins/example/skills/plugin-skill/SKILL.md",
          scope: "user",
          enabled: false,
        }],
        errors: [{ path: "/workspace/.agents/skills/broken/SKILL.md", message: "invalid frontmatter: missing name" }],
      }],
    }, ["/plugins/example/skills"]);

    expect(snapshot.skillGroups).toHaveLength(1);
    expect(snapshot.skills).toHaveLength(2);
    expect(snapshot.skills[0]).toMatchObject({ source: "repo", displayName: "Repository Review", enabled: true });
    expect(snapshot.skills[1]).toMatchObject({ source: "plugin", enabled: false });
    expect(snapshot.skillErrors).toEqual([{
      cwd: "/workspace",
      path: "/workspace/.agents/skills/broken/SKILL.md",
      message: "invalid frontmatter: missing name",
    }]);
  });

  it("builds native typed skill inputs once without copying skill bodies", () => {
    const input = buildAgentInput("Fix the tests", [{ type: "text", name: "notes.md", text: "Read /workspace/notes.md" }], [
      { name: "test-fixer", path: "/skills/test-fixer/SKILL.md" },
      { name: "test-fixer", path: "/skills/test-fixer/SKILL.md" },
    ]);
    expect(input).toEqual([{
      type: "text",
      text: "Fix the tests\n\nRead /workspace/notes.md",
      text_elements: [],
    }, {
      type: "skill",
      name: "test-fixer",
      path: "/skills/test-fixer/SKILL.md",
    }]);
    expect(JSON.stringify(input)).not.toContain("skill_body");
  });

  it("keeps selected skills visible in the optimistic persistent Turn", () => {
    const thread: CodexThread = { id: "thread-1", preview: "", cwd: "/workspace", updatedAt: 1, turns: [] };
    const next = optimisticTurn(thread, "turn-1", "Run review", [], [{
      name: "repo-review",
      displayName: "Repository Review",
      path: "/skills/repo-review/SKILL.md",
    }]);
    expect(next.turns?.[0].items[0].content).toEqual([
      { type: "text", text: "Run review", text_elements: [] },
      { type: "skill", name: "repo-review", displayName: "Repository Review", path: "/skills/repo-review/SKILL.md" },
    ]);

    const failed = failOptimisticTurn(next, "turn-1", "上游连接失败");
    expect(failed.turns?.[0]).toMatchObject({
      status: "failed",
      error: { message: "上游连接失败" },
    });
    expect(failed.turns?.[0].items[0].content).toEqual(next.turns?.[0].items[0].content);
  });
});
