import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  mapPackModuleToResumeModule,
  parseCareerSourcePackJson,
  upsertPackResumeModules
} from "./careerSourcePack";

const fixturePath = join(
  process.cwd(),
  "public/fixtures/sample-career-source-pack.v1.json"
);
const fixtureJson = readFileSync(fixturePath, "utf8");

describe("parseCareerSourcePackJson", () => {
  it("parses the synthetic fixture", () => {
    const result = parseCareerSourcePackJson(fixtureJson);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.pack.extractionMetadata.schemaVersion).toBe(1);
    expect(result.pack.resumeModules.length).toBeGreaterThanOrEqual(2);
    expect(result.pack.roleRecipes.length).toBeGreaterThanOrEqual(3);
    expect(result.warnings.some((w) => w.includes("Synthetic fixture"))).toBe(true);
  });

  it("rejects invalid JSON", () => {
    const result = parseCareerSourcePackJson("{not json");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("Invalid JSON");
  });

  it("rejects wrong schema version", () => {
    const parsed = JSON.parse(fixtureJson) as Record<string, unknown>;
    const metadata = parsed.extractionMetadata as Record<string, unknown>;
    metadata.schemaVersion = 2;
    const result = parseCareerSourcePackJson(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("schema version");
  });

  it("rejects missing required sections", () => {
    const parsed = JSON.parse(fixtureJson) as Record<string, unknown>;
    delete parsed.roleRecipes;
    const result = parseCareerSourcePackJson(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
  });

  it("rejects secrets in pack content", () => {
    const parsed = JSON.parse(fixtureJson) as Record<string, unknown>;
    (parsed as { notes?: string }).notes = "SUPABASE_SERVICE_ROLE=abc";
    const result = parseCareerSourcePackJson(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.toLowerCase()).toContain("secret");
  });

  it("warns on PII-like content without rejecting", () => {
    const parsed = JSON.parse(fixtureJson) as Record<string, unknown>;
    const positioning = parsed.careerPositioning as Record<string, unknown>;
    positioning.summary = "Contact test.user@example.com for details.";
    const result = parseCareerSourcePackJson(JSON.stringify(parsed));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.warnings.some((w) => w.toLowerCase().includes("email"))).toBe(true);
  });

  it("validates module snake_case ids", () => {
    const parsed = JSON.parse(fixtureJson) as Record<string, unknown>;
    const modules = parsed.resumeModules as Array<Record<string, unknown>>;
    modules[0].id = "Bad-Module";
    const result = parseCareerSourcePackJson(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
  });
});

describe("resume module mapping", () => {
  it("maps pack modules and upserts by id", () => {
    const parsed = parseCareerSourcePackJson(fixtureJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const mapped = mapPackModuleToResumeModule(parsed.pack.resumeModules[0]);
    expect(mapped.importedFromCareerPack).toBe(true);
    expect(mapped.bestFor.length).toBeGreaterThan(0);

    const existing = [{ ...mapped, summary: "Old summary" }];
    const updated = upsertPackResumeModules(existing, parsed.pack.resumeModules);
    expect(updated).toHaveLength(parsed.pack.resumeModules.length);
    expect(updated.find((m) => m.id === mapped.id)?.summary).toBe(mapped.summary);
  });
});
