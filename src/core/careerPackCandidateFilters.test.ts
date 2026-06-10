import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { filterAndSortCandidatesWithCareerPack } from "./careerPackCandidateFilters";
import {
  matchCandidatesWithCareerPack,
  type CareerCandidateMatch
} from "./careerPackMatching";
import { parseCareerSourcePackJson } from "./careerSourcePack";
import { createJobCandidate } from "./jobScout";
import { seedResumeModules } from "../data/seedJobScout";
import type { JobCandidate } from "./types";

const fixturePath = join(
  process.cwd(),
  "public/fixtures/sample-career-source-pack.v1.json"
);
const pack = parseCareerSourcePackJson(readFileSync(fixturePath, "utf8"));
if (!pack.ok) {
  throw new Error("Fixture failed to parse");
}

function candidate(
  id: string,
  company: string,
  title: string,
  description: string,
  fitScore: number
): JobCandidate {
  const base = createJobCandidate(
    {
      company,
      roleTitle: title,
      description,
      roleType: "software",
      origin: "source_fetch"
    },
    seedResumeModules
  );
  return { ...base, id, fitScore, discoveredAt: `2026-06-0${id.slice(-1)}T12:00:00.000Z` };
}

describe("filterAndSortCandidatesWithCareerPack", () => {
  const candidates = [
    candidate("c1", "Northrop", "Software Engineer I", "new grad python clearance eligible", 70),
    candidate("c2", "BigCo", "Principal Engineer", "10+ years active ts/sci required", 90),
    candidate("c3", "Startup", "Backend", "fastapi postgresql docker", 65)
  ];
  const matches = matchCandidatesWithCareerPack(candidates, pack.pack, [], []);

  it("returns candidates unchanged when matches map is empty", () => {
    const result = filterAndSortCandidatesWithCareerPack(
      candidates,
      new Map<string, CareerCandidateMatch>(),
      {},
      "best_fit"
    );
    expect(result).toEqual(candidates);
  });

  it("filters by fit tier and hides weak", () => {
    const strongOnly = filterAndSortCandidatesWithCareerPack(
      candidates,
      matches,
      { fitTier: "strong" },
      "queue_order"
    );
    expect(strongOnly.every((c) => matches.get(c.id)?.fitTier === "strong")).toBe(true);

    const hideWeak = filterAndSortCandidatesWithCareerPack(
      candidates,
      matches,
      { hideWeak: true },
      "queue_order"
    );
    expect(hideWeak.some((c) => c.id === "c2")).toBe(false);
  });

  it("sorts by best fit tier then fit score", () => {
    const sorted = filterAndSortCandidatesWithCareerPack(
      candidates,
      matches,
      {},
      "best_fit"
    );
    const tiers = sorted.map((c) => matches.get(c.id)?.fitTier);
    const firstTierRank = tiers[0] === "strong" ? 3 : tiers[0] === "mixed" ? 2 : 1;
    const lastTierRank = tiers[tiers.length - 1] === "weak" ? 1 : 2;
    expect(firstTierRank).toBeGreaterThanOrEqual(lastTierRank);
  });

  it("filters by search text", () => {
    const result = filterAndSortCandidatesWithCareerPack(
      candidates,
      matches,
      { searchText: "northrop" },
      "queue_order"
    );
    expect(result).toHaveLength(1);
    expect(result[0].company).toBe("Northrop");
  });
});
