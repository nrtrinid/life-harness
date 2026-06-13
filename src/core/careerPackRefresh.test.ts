import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { CareerSourcePackV1 } from "./careerSourcePack";
import { parseCareerSourcePackJson } from "./careerSourcePack";
import {
  formatCareerPackRefreshSummary,
  hasCareerPackRefreshChanges,
  isIncomingPackNewer,
  summarizeCareerPackRefresh
} from "./careerPackRefresh";

const fixturePath = join(
  process.cwd(),
  "public/fixtures/sample-career-source-pack.v1.json"
);
const fixtureJson = readFileSync(fixturePath, "utf8");

function loadFixturePack(): CareerSourcePackV1 {
  const parsed = parseCareerSourcePackJson(fixtureJson);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.pack;
}

describe("careerPackRefresh", () => {
  it("detects no changes when incoming matches stored pack", () => {
    const pack = loadFixturePack();
    const stored = { pack, importedAt: "2026-06-10T13:00:00.000Z" };
    const summary = summarizeCareerPackRefresh(stored, pack);
    expect(hasCareerPackRefreshChanges(summary)).toBe(false);
    expect(summary.moduleChanges.updated).toEqual([]);
    expect(formatCareerPackRefreshSummary(summary)).toContain(
      "No module or role recipe changes detected."
    );
  });

  it("detects updated module when a bullet changes", () => {
    const pack = loadFixturePack();
    const stored = { pack, importedAt: "2026-06-10T13:00:00.000Z" };
    const incoming: CareerSourcePackV1 = structuredClone(pack);
    incoming.extractionMetadata.generatedAt = "2026-06-11T12:00:00.000Z";
    incoming.resumeModules[0].bullets = [
      ...incoming.resumeModules[0].bullets,
      "Added a new shipped feature bullet."
    ];

    const summary = summarizeCareerPackRefresh(stored, incoming);
    expect(summary.moduleChanges.updated).toEqual(["ev_tracker"]);
    expect(summary.isNewerThanStored).toBe(true);
    expect(hasCareerPackRefreshChanges(summary)).toBe(true);
    expect(formatCareerPackRefreshSummary(summary)[0]).toContain("ev_tracker");
  });

  it("detects added and removed modules", () => {
    const pack = loadFixturePack();
    const stored = { pack, importedAt: "2026-06-10T13:00:00.000Z" };
    const incoming: CareerSourcePackV1 = structuredClone(pack);
    incoming.resumeModules = incoming.resumeModules.filter((module) => module.id !== "the_charter");
    incoming.resumeModules.push({
      id: "auditwiseai",
      title: "AuditWiseAI",
      category: "project",
      summary: "Audit tooling project.",
      tags: ["software"],
      skills: ["Python"],
      bullets: ["Built audit triage tooling."],
      bestFor: ["software"],
      proof: [],
      sourceFiles: ["projects/auditwiseai.md"],
      confidence: "medium",
      claimsToAvoid: [],
      metricsToGather: [],
      isActive: true
    });

    const summary = summarizeCareerPackRefresh(stored, incoming);
    expect(summary.moduleChanges.added).toEqual(["auditwiseai"]);
    expect(summary.moduleChanges.removed).toEqual(["the_charter"]);
  });

  it("isIncomingPackNewer when no stored pack", () => {
    const pack = loadFixturePack();
    expect(isIncomingPackNewer(null, pack)).toBe(true);
  });

  it("counts modules to upsert from incoming pack", () => {
    const pack = loadFixturePack();
    const summary = summarizeCareerPackRefresh(null, pack);
    expect(summary.modulesToUpsertInBank).toBe(pack.resumeModules.length);
  });
});
