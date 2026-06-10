import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  applyClearCareerSourcePack,
  applyImportCareerSourcePack,
  type LifeHarnessData
} from "./actions";
import { seedResumeModules } from "../data/seedJobScout";
import { seedCards, seedDailyState, seedLogs, seedProofItems } from "../data/seed";

const fixturePath = join(
  process.cwd(),
  "public/fixtures/sample-career-source-pack.v1.json"
);
const fixtureJson = readFileSync(fixturePath, "utf8");

function baseState(): LifeHarnessData {
  return {
    cards: structuredClone(seedCards),
    logs: structuredClone(seedLogs),
    proofItems: structuredClone(seedProofItems),
    dailyState: structuredClone(seedDailyState),
    resumeModules: structuredClone(seedResumeModules),
    jobCandidates: [],
    jobSources: [],
    jobSourceRuns: [],
    chatSummaries: [],
    memoryItems: [],
    careerSourcePack: null
  };
}

describe("career source pack actions", () => {
  it("imports pack and stores modules", () => {
    const imported = applyImportCareerSourcePack(baseState(), fixtureJson, "2026-06-10T12:00:00.000Z");
    expect(imported.ok).toBe(true);
    expect(imported.state.careerSourcePack?.importedAt).toBe("2026-06-10T12:00:00.000Z");
    expect(imported.state.careerSourcePack?.pack.resumeModules.length).toBeGreaterThan(0);
    expect(
      imported.state.resumeModules.some((m) => m.id === "ev_tracker" && m.importedFromCareerPack)
    ).toBe(true);
  });

  it("re-import updates modules in place without duplicates", () => {
    const first = applyImportCareerSourcePack(baseState(), fixtureJson, "2026-06-10T12:00:00.000Z");
    expect(first.ok).toBe(true);

    const parsed = JSON.parse(fixtureJson) as Record<string, unknown>;
    const metadata = parsed.extractionMetadata as Record<string, unknown>;
    metadata.generatedAt = "2026-06-11T12:00:00.000Z";
    metadata.warnings = ["Updated warning on re-import."];
    const modules = parsed.resumeModules as Array<Record<string, unknown>>;
    modules[0].summary = "Updated EV Tracker summary for re-import test.";

    const second = applyImportCareerSourcePack(
      first.state,
      JSON.stringify(parsed),
      "2026-06-11T12:00:00.000Z"
    );
    expect(second.ok).toBe(true);
    const evTracker = second.state.resumeModules.filter((m) => m.id === "ev_tracker");
    expect(evTracker).toHaveLength(1);
    expect(evTracker[0].summary).toContain("Updated EV Tracker");
    expect(second.state.careerSourcePack?.importedAt).toBe("2026-06-11T12:00:00.000Z");
    expect(
      second.state.careerSourcePack?.pack.extractionMetadata.warnings.some((w) =>
        w.includes("Updated warning")
      )
    ).toBe(true);
  });

  it("failed import leaves previous pack and modules unchanged", () => {
    const first = applyImportCareerSourcePack(baseState(), fixtureJson);
    expect(first.ok).toBe(true);
    const beforeModules = first.state.resumeModules;
    const beforePack = first.state.careerSourcePack;

    const failed = applyImportCareerSourcePack(first.state, "{bad json");
    expect(failed.ok).toBe(false);
    expect(failed.state.careerSourcePack).toEqual(beforePack);
    expect(failed.state.resumeModules).toEqual(beforeModules);
  });

  it("clear removes pack but keeps modules", () => {
    const imported = applyImportCareerSourcePack(baseState(), fixtureJson);
    const cleared = applyClearCareerSourcePack(imported.state);
    expect(cleared.ok).toBe(true);
    expect(cleared.state.careerSourcePack).toBeNull();
    expect(cleared.state.resumeModules.some((m) => m.id === "ev_tracker")).toBe(true);
  });
});
