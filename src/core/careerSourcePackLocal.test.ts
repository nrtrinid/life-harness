import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { applyImportCareerSourcePack } from "./actions";
import { buildCareerSourcePackFromMarkdown } from "./careerSourcePackBuilder";
import {
  collectCareerSourceMarkdownFiles,
  countCareerPackSections,
  formatCareerPackValidationLines,
  isPlaceholderCareerSource,
  PLACEHOLDER_CAREER_SOURCE_MESSAGE,
  validateCareerSourcePackJson
} from "./careerSourcePackLocal";
import { buildApplicationResumeReadiness } from "./resumeReadiness";
import type { LifeHarnessData } from "./lifeHarnessData";
import { seedResumeModules } from "../data/seedJobScout";
import { seedCards, seedDailyState, seedLogs, seedProofItems } from "../data/seed";
import type { LifeCard, ResumeDraftPacket } from "./types";

const fixturePackPath = join(process.cwd(), "public/fixtures/sample-career-source-pack.v1.json");
const fixturePackJson = readFileSync(fixturePackPath, "utf8");

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
    projects: [],
    agentSessions: [],
    featureSprintPlans: [],
    featureSprintRunnerRuns: [],
    careerSourcePack: null
  };
}

describe("careerSourcePackLocal", () => {
  it("detects placeholder-only private source trees", () => {
    expect(
      isPlaceholderCareerSource([
        { path: "README.md", content: "# Private placeholder" },
        { path: "career-source/README.md", content: "# Nested readme" }
      ])
    ).toBe(true);
    expect(
      isPlaceholderCareerSource([
        { path: "README.md", content: "# Root" },
        { path: "projects/ev_tracker.md", content: "# EV Tracker" }
      ])
    ).toBe(false);
  });

  it("validates the public fixture pack and reports counts", () => {
    const result = validateCareerSourcePackJson(fixturePackJson);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.counts.resumeModules).toBeGreaterThan(0);
    expect(result.counts.roleRecipes).toBeGreaterThan(0);
    expect(result.counts.interviewStories).toBeGreaterThan(0);
    expect(result.counts.projectModules).toBeGreaterThan(0);
    expect(formatCareerPackValidationLines(result).some((line) => line.includes("validation passed"))).toBe(
      true
    );
  });

  it("fails clearly for invalid JSON", () => {
    const result = validateCareerSourcePackJson("{ not json");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("exposes a stable placeholder message for dogfood scripts", () => {
    expect(PLACEHOLDER_CAREER_SOURCE_MESSAGE).toContain("README placeholders");
    expect(PLACEHOLDER_CAREER_SOURCE_MESSAGE).toContain("../career-source");
  });
});

describe("career pack dogfood chain", () => {
  it("imports fixture pack with modules, role recipes, and interview stories", () => {
    const imported = applyImportCareerSourcePack(baseState(), fixturePackJson, "2026-06-12T12:00:00.000Z");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const pack = imported.state.careerSourcePack?.pack;
    expect(pack?.resumeModules.length).toBeGreaterThan(0);
    expect(pack?.roleRecipes.length).toBeGreaterThan(0);
    expect(pack?.interviewStories.length).toBeGreaterThan(0);
    expect(imported.state.resumeModules.some((module) => module.id === "ev_tracker")).toBe(true);
    expect(countCareerPackSections(pack!).resumeModules).toBe(pack!.resumeModules.length);
  });

  it("supports application readiness and export readiness after import", () => {
    const imported = applyImportCareerSourcePack(baseState(), fixturePackJson);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const selectedModuleIds = ["ev_tracker", "network_security_lab", "the_charter"];
    const packet: ResumeDraftPacket = {
      createdAt: "2026-06-12T00:00:00.000Z",
      sourceCandidateId: "candidate-1",
      company: "Fixture Co",
      roleTitle: "Software Engineer",
      resumeAngle: "Security-aware full-stack engineer.",
      selectedModuleIds,
      sectionCoverage: ["projects"],
      missingEvidence: [],
      nextTinyAction: "Review imported modules."
    };
    const card: LifeCard = {
      id: "card-1",
      title: "Fixture Co - Software Engineer",
      area: "social_career",
      state: "inbox",
      progress: 0,
      warmth: "warm",
      nextTinyAction: "Tailor resume angle.",
      recentWins: [],
      openLoops: [],
      optimizationIdeas: [],
      proofItemIds: [],
      careerApplication: {
        company: "Fixture Co",
        roleTitle: "Software Engineer",
        jobDescription: "Full-stack software role.",
        roleType: "software",
        applicationStatus: "inbox",
        resumeDraftPacket: packet
      }
    };

    const readiness = buildApplicationResumeReadiness({
      card,
      resumeModules: imported.state.resumeModules,
      careerSourcePack: imported.state.careerSourcePack?.pack ?? null
    });

    expect(readiness.status).toBe("needs_patch");
    expect(readiness.selectedModulesBySection.projects.length).toBe(3);
    expect(readiness.nextTinyResumeAction.length).toBeGreaterThan(0);
    expect(readiness.warnings.map((warning) => warning.category)).toEqual(
      expect.arrayContaining(["missing_proof", "missing_section_coverage"])
    );
  });

  it("builds markdown fixtures into an importable pack without private data", () => {
    const files = collectCareerSourceMarkdownFiles(join(process.cwd(), "public/fixtures"));
    const markdownOnly = files.filter((file) => file.path.endsWith(".md"));
    expect(markdownOnly.length).toBe(0);

    const built = buildCareerSourcePackFromMarkdown({
      files: [
        {
          path: "README.md",
          content: "# Career Source\n\n## Current positioning\n\n1. **EV Tracker** - analytics."
        },
        {
          path: "projects/ev_tracker.md",
          content: `# EV Tracker

## Best 3-bullet resume version

- Built a full-stack analytics platform.
- Integrated external APIs.

## Claims to avoid

- Do not claim exact users.`
        },
        {
          path: "roles/general_swe.md",
          content: `# General Software Engineer

## Preferred modules

- ev_tracker`
        }
      ],
      generatedAt: "2026-06-12T00:00:00.000Z"
    });

    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    const validated = validateCareerSourcePackJson(JSON.stringify(built.pack));
    expect(validated.ok).toBe(true);
    const imported = applyImportCareerSourcePack(baseState(), JSON.stringify(built.pack));
    expect(imported.ok).toBe(true);
  });
});
