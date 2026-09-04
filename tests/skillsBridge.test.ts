import { describe, expect, it, vi } from "vitest";
import { CodexBridge } from "../src/main/codexBridge";

describe("CodexBridge Skills roots", () => {
  it("does not retrigger skills/changed by writing unchanged extra roots", async () => {
    const bridge = new CodexBridge();
    const request = vi.fn(async (method: string) => method === "skills/list" ? { data: [] } : {});
    (bridge as unknown as { request: typeof request }).request = request;

    await Promise.all([
      bridge.listSkills("/workspace", ["/plugins/b", "/plugins/a"], false),
      bridge.listSkills("/workspace", ["/plugins/a", "/plugins/b"], true),
    ]);

    expect(request.mock.calls.filter(([method]) => method === "skills/extraRoots/set")).toEqual([
      ["skills/extraRoots/set", { extraRoots: ["/plugins/a", "/plugins/b"] }],
    ]);
    expect(request.mock.calls.filter(([method]) => method === "skills/list")).toHaveLength(2);

    await bridge.stop();
    await bridge.listSkills("/workspace", ["/plugins/a", "/plugins/b"], false);
    expect(request.mock.calls.filter(([method]) => method === "skills/extraRoots/set")).toHaveLength(2);
  });
});
