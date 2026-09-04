import { describe, expect, it } from "vitest";
import {
  PROVIDER_BY_ID,
  PROVIDER_CATALOG,
  allProviderModels,
  getProviderModel,
  providerCoverage,
  providerForModel,
} from "../src/shared/providerCatalog";

describe("native provider catalog", () => {
  it("covers official, cloud, aggregator and compatible providers across every modality", () => {
    const coverage = providerCoverage();
    expect(coverage.providers).toBeGreaterThanOrEqual(28);
    expect(coverage.officialOrCloud).toBeGreaterThanOrEqual(22);
    expect(coverage.native).toBeGreaterThanOrEqual(20);
    expect(coverage.seededModels).toBeGreaterThan(100);
    expect(coverage.modalities).toEqual(expect.objectContaining({ llm: expect.any(Number), image: expect.any(Number), audio: expect.any(Number), video: expect.any(Number) }));
    for (const count of Object.values(coverage.modalities)) expect(count).toBeGreaterThanOrEqual(8);
  });

  it("uses unique provider and globally unique model ids", () => {
    expect(new Set(PROVIDER_CATALOG.map((item) => item.id)).size).toBe(PROVIDER_CATALOG.length);
    const models = allProviderModels();
    expect(new Set(models.map((item) => item.id)).size).toBe(models.length);
    for (const model of models) expect(PROVIDER_BY_ID.has(model.providerId ?? "")).toBe(true);
  });

  it("keeps AI Task model ids backward-compatible and namespaces native models", () => {
    expect(providerForModel("seedance-2.5")?.id).toBe("ai-task-mcp");
    expect(providerForModel("openai::gpt-5.6-sol")?.id).toBe("openai");
    expect(getProviderModel("openai::gpt-5.6-sol")?.nativeModelId).toBe("gpt-5.6-sol");
  });

  it("contains credential schemas but no credential values", () => {
    for (const provider of PROVIDER_CATALOG) {
      expect(provider.docsUrl).toMatch(/^https:\/\//);
      expect(provider.credentialFields.length).toBeGreaterThan(0);
      expect(JSON.stringify(provider)).not.toMatch(/sk-[A-Za-z0-9]{12,}/);
    }
  });
});
