import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createNeutralCareerMatch,
  matchCandidateWithCareerPack,
  matchCandidatesWithCareerPack
} from "./careerPackMatching";
import {
  mapPackModuleToResumeModule,
  parseCareerSourcePackJson,
  type CareerSourcePackV1
} from "./careerSourcePack";
import { createJobCandidate } from "./jobScout";
import { seedResumeModules } from "../data/seedJobScout";
import type { JobCandidate, ResumeModule } from "./types";

const fixturePath = join(
  process.cwd(),
  "public/fixtures/sample-career-source-pack.v1.json"
);

function loadFixturePack(): CareerSourcePackV1 {
  const result = parseCareerSourcePackJson(readFileSync(fixturePath, "utf8"));
  if (!result.ok) {
    throw new Error("Fixture failed to parse");
  }
  return result.pack;
}

const fixturePack = loadFixturePack();

function modulesWithPack(): ResumeModule[] {
  const packModules = fixturePack.resumeModules.map(mapPackModuleToResumeModule);
  return [...seedResumeModules, ...packModules];
}

function makeCandidate(
  overrides: Partial<JobCandidate> & Pick<JobCandidate, "company" | "roleTitle" | "description">
): JobCandidate {
  return createJobCandidate(
    {
      company: overrides.company,
      roleTitle: overrides.roleTitle,
      description: overrides.description,
      roleType: overrides.roleType ?? "software",
      location: overrides.location,
      sourceId: overrides.sourceId,
      origin: overrides.origin ?? "source_fetch"
    },
    modulesWithPack()
  );
}

describe("matchCandidateWithCareerPack", () => {
  it("returns neutral match when no pack is used via helper", () => {
    const neutral = createNeutralCareerMatch();
    expect(neutral.fitTier).toBe("mixed");
    expect(neutral.roleRecipeId).toBeNull();
  });

  it("matches FastAPI full-stack role to full_stack_backend", () => {
    const candidate = makeCandidate({
      company: "Startup",
      roleTitle: "Backend Engineer",
      description:
        "Build FastAPI services, PostgreSQL schemas, Docker deployment, and Next.js dashboards."
    });
    const match = matchCandidateWithCareerPack(candidate, fixturePack, modulesWithPack());
    expect(match.roleRecipeId).toBe("full_stack_backend");
    expect(match.matchedModuleIds).toContain("ev_tracker");
    expect(["strong", "mixed"]).toContain(match.fitTier);
  });

  it("matches Northrop-shaped junior defense role with clearance eligible", () => {
    const candidate = makeCandidate({
      company: "Northrop Grumman",
      roleTitle: "Software Engineer I",
      description:
        "Python and C++ on Linux. Security-minded development. U.S. citizen. Able to obtain Secret clearance. Defense aerospace environment."
    });
    const match = matchCandidateWithCareerPack(candidate, fixturePack, modulesWithPack(), "Northrop Workday");
    expect(["cyber_defense", "public_sector_it", "general_swe"]).toContain(match.roleRecipeId);
    expect(match.positiveSignals.some((s) => s.label.toLowerCase().includes("clearance"))).toBe(
      true
    );
    expect(
      match.cautionSignals.some((s) => s.label.toLowerCase().includes("active clearance"))
    ).toBe(false);
    expect(["strong", "mixed"]).toContain(match.fitTier);
  });

  it("flags Principal Engineer with active TS/SCI as weak", () => {
    const candidate = makeCandidate({
      company: "Defense Contractor",
      roleTitle: "Principal Engineer",
      description: "Active TS/SCI required. 10+ years experience. Staff-level architecture."
    });
    const match = matchCandidateWithCareerPack(candidate, fixturePack, modulesWithPack());
    expect(match.fitTier).toBe("weak");
    expect(match.cautionSignals.length).toBeGreaterThan(0);
  });

  it("flags no new grads roles as weak", () => {
    const candidate = makeCandidate({
      company: "BigCo",
      roleTitle: "Software Engineer",
      description: "No new grads. 5+ years required."
    });
    const match = matchCandidateWithCareerPack(candidate, fixturePack, modulesWithPack());
    expect(match.fitTier).toBe("weak");
  });

  it("matches AI simulation roles to ai_tooling_simulation", () => {
    const candidate = makeCandidate({
      company: "SimLab",
      roleTitle: "AI Diagnostics Engineer",
      description: "Python simulation tooling, pytest harnesses, LLM policy diagnostics."
    });
    const match = matchCandidateWithCareerPack(candidate, fixturePack, modulesWithPack());
    expect(match.roleRecipeId).toBe("ai_tooling_simulation");
    expect(match.matchedModuleIds).toContain("the_charter");
  });

  it("surfaces evidence gaps for matched modules", () => {
    const candidate = makeCandidate({
      company: "Startup",
      roleTitle: "Full Stack Engineer",
      description: "FastAPI, Next.js, PostgreSQL, Docker."
    });
    const match = matchCandidateWithCareerPack(candidate, fixturePack, modulesWithPack());
    expect(match.evidenceGaps.some((g) => g.moduleId === "ev_tracker")).toBe(true);
  });

  it("batch matches candidates by id", () => {
    const candidates = [
      makeCandidate({ company: "A", roleTitle: "SWE I", description: "new grad python" }),
      makeCandidate({ company: "B", roleTitle: "Principal", description: "10+ years staff" })
    ];
    const map = matchCandidatesWithCareerPack(candidates, fixturePack, modulesWithPack(), []);
    expect(map.size).toBe(2);
    expect(map.get(candidates[1].id)?.fitTier).toBe("weak");
  });
});
