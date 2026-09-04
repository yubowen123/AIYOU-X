import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("AIYOU product identity", () => {
  it("uses AIYOU in app and installer metadata", () => {
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(pkg.name).toBe("aiyou-desktop");
    expect(pkg.build.productName).toBe("AIYOU");
    expect(pkg.build.mac.artifactName).toContain("AIYOU");
    expect(pkg.build.win.artifactName).toContain("AIYOU");
    expect(pkg.build.mac.icon).toBe("build/icon.icns");
    expect(pkg.build.win.icon).toBe("build/icon.png");
  });

  it("uses the selected coral and yellow AY mark in the app and package", () => {
    const icon = readFileSync(resolve("build/icon.svg"), "utf8");
    const brandMark = readFileSync(resolve("src/renderer/components/BrandMark.tsx"), "utf8");

    expect(icon).toContain("#FF8582");
    expect(icon).toContain("#FFD85A");
    expect(icon).not.toContain("#23A88B");
    expect(brandMark).toContain("../../../build/icon.svg");
    expect(brandMark).toContain("<img");
  });
});
