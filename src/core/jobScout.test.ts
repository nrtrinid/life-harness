import { describe, expect, it } from "vitest";

import {
  buildCareerIntakeFromCandidate,
  buildCandidateBriefingSignals,
  buildFitFinderResult,
  buildJobScoutStats,
  checkJobScoutLocks,
  countManualCandidates,
  createJobCandidate,
  createResumeModule,
  detectSeniorityMismatch,
  formatFitFinderNotice,
  getFitLabel,
  getFitLabelDisplay,
  getFitTier,
  getFitTierLabel,
  getSuggestedResumeModules,
  scoreJobCandidate
} from "./jobScout";
import { seedJobCandidates, seedJobSources, seedResumeModules } from "../data/seedJobScout";
import type { JobCandidate, ResumeModule } from "./types";

describe("seedResumeModules", () => {
  it("includes active modules with tags and bestFor", () => {
    expect(seedResumeModules.length).toBeGreaterThanOrEqual(8);
    expect(seedResumeModules.every((module) => module.isActive)).toBe(true);
    expect(seedResumeModules[0]?.tags.length).toBeGreaterThan(0);
    expect(seedResumeModules[0]?.bestFor.length).toBeGreaterThan(0);
  });
});

describe("getFitLabel and getFitTier aliases", () => {
  it("maps 4-tier label boundaries correctly", () => {
    expect(getFitLabel(85)).toBe("strong");
    expect(getFitLabel(70)).toBe("possible");
    expect(getFitLabel(50)).toBe("stretch");
    expect(getFitLabel(30)).toBe("bad_fit");
    expect(getFitLabelDisplay("possible")).toBe("Possible fit");
  });

  it("maps legacy getFitTier from score", () => {
    expect(getFitTier(80)).toBe("strong");
    expect(getFitTier(70)).toBe("mixed");
    expect(getFitTier(50)).toBe("mixed");
    expect(getFitTier(30)).toBe("weak");
    expect(getFitTierLabel(80)).toBe("Strong fit");
  });
});

describe("detectSeniorityMismatch", () => {
  it("hard disqualifies senior title", () => {
    const result = detectSeniorityMismatch("Senior Software Engineer", "Build features.");
    expect(result.hardDisqualifier).toBe(true);
  });

  it("penalizes description-only senior language without hard disqualifier", () => {
    const result = detectSeniorityMismatch(
      "Software Engineer",
      "Collaborate with senior engineers on platform work."
    );
    expect(result.hardDisqualifier).toBe(false);
    expect(result.penalty).toBeGreaterThan(0);
    expect(result.gap).toBeTruthy();
  });

  it("hard disqualifies explicit years requirement", () => {
    const result = detectSeniorityMismatch("Engineer", "Requires 10+ years experience.");
    expect(result.hardDisqualifier).toBe(true);
  });
});

describe("scoreJobCandidate", () => {
  const modules: ResumeModule[] = [
    createResumeModule({
      id: "mod-security",
      title: "Security-Aware Development",
      category: "skill_cluster",
      summary: "Security habits",
      tags: ["security"],
      bullets: ["Applied secure development practices"],
      skills: ["security", "application security"],
      bestFor: ["cybersecurity"],
      isActive: true
    }),
    createResumeModule({
      id: "mod-python",
      title: "Python Stack",
      category: "skill_cluster",
      summary: "Python work",
      tags: ["python"],
      bullets: ["Built APIs with Python"],
      skills: ["Python", "FastAPI"],
      bestFor: ["software"],
      isActive: true
    })
  ];

  it("returns bounded deterministic score with reasons and matched skills", () => {
    const scored = scoreJobCandidate(
      {
        roleTitle: "Security Engineer",
        description: "Needs Python, security, and application security experience.",
        roleType: "cybersecurity"
      },
      modules
    );

    expect(scored.fitScore).toBeGreaterThanOrEqual(0);
    expect(scored.fitScore).toBeLessThanOrEqual(100);
    expect(scored.fitReasons.length).toBeGreaterThan(0);
    expect(scored.suggestedResumeModuleIds.length).toBeGreaterThan(0);
    expect(scored.matchedSkills?.length).toBeGreaterThan(0);
    expect(scored.fitLabel).toBeTruthy();
  });

  it("scores entry-level software/security role strongly", () => {
    const scored = scoreJobCandidate(
      {
        roleTitle: "Junior Software Engineer",
        description: "Entry-level role. Python, security, and application security required.",
        roleType: "cybersecurity"
      },
      modules
    );

    expect(scored.fitLabel).toMatch(/strong|possible/);
    expect(scored.fitReasons.some((r) => r.includes("entry-level"))).toBe(true);
  });

  it("marks senior title as bad_fit", () => {
    const scored = scoreJobCandidate(
      {
        roleTitle: "Senior Staff Security Engineer",
        description: "Python and security.",
        roleType: "cybersecurity"
      },
      modules
    );

    expect(scored.fitLabel).toBe("bad_fit");
    expect(scored.fitScore).toBeLessThanOrEqual(40);
  });

  it("does not auto bad_fit for description-only senior mention", () => {
    const scored = scoreJobCandidate(
      {
        roleTitle: "Software Engineer",
        description: "Work with senior engineers. Python and security required.",
        roleType: "software"
      },
      modules
    );

    expect(scored.fitLabel).not.toBe("bad_fit");
    expect(scored.gaps.some((g) => g.includes("senior"))).toBe(true);
  });

  it("adds missing location signal when location unclear", () => {
    const scored = scoreJobCandidate(
      {
        roleTitle: "Engineer",
        description: "Python role with no location details.",
        roleType: "software"
      },
      modules
    );

    expect(scored.missingSignals?.some((s) => s.includes("Location"))).toBe(true);
  });

  it("suggests 2-4 modules for cybersecurity posting", () => {
    const candidate = createJobCandidate(
      {
        company: "Acme",
        roleTitle: "Security Engineer",
        description: "Python, TypeScript, React, security, application security required.",
        roleType: "cybersecurity",
        origin: "manual"
      },
      seedResumeModules
    );

    expect(candidate.fitLabel).toBeTruthy();
    expect(candidate.matchedSkills?.length).toBeGreaterThan(0);

    const suggested = getSuggestedResumeModules(candidate, seedResumeModules);
    expect(suggested.length).toBeGreaterThanOrEqual(2);
    expect(suggested.length).toBeLessThanOrEqual(4);
  });
});

describe("formatFitFinderNotice and buildFitFinderResult", () => {
  it("formats tier counts for created candidates", () => {
    const candidates = [
      createJobCandidate(
        {
          company: "A",
          roleTitle: "Junior Engineer",
          description: "Entry-level Python security role.",
          roleType: "software",
          origin: "source_fetch"
        },
        seedResumeModules
      ),
      createJobCandidate(
        {
          company: "B",
          roleTitle: "Senior Engineer",
          description: "10+ years required.",
          roleType: "software",
          origin: "source_fetch"
        },
        seedResumeModules
      )
    ];

    const message = formatFitFinderNotice({ createdCandidates: candidates, skippedDuplicates: 2 });
    expect(message).toContain("fit match");
    expect(message).toContain("Skipped 2 duplicates");
  });

  it("returns structured fit finder result", () => {
    const candidate = createJobCandidate(
      {
        company: "A",
        roleTitle: "Engineer",
        description: "Python",
        roleType: "software",
        origin: "source_fetch"
      },
      seedResumeModules
    );

    const result = buildFitFinderResult({
      ok: true,
      createdCandidates: [candidate],
      skippedDuplicates: 0
    });

    expect(result.createdCandidateIds).toEqual([candidate.id]);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("handles no sources message", () => {
    const result = buildFitFinderResult({
      ok: false,
      createdCandidates: [],
      skippedDuplicates: 0,
      noSourcesMessage: "Add a source first, or paste a job post to score it."
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Add a source first");
  });
});

describe("buildCareerIntakeFromCandidate", () => {
  it("defaults application status to inbox via intake builder", () => {
    const candidate = seedJobCandidates[0];
    const intake = buildCareerIntakeFromCandidate(candidate, seedResumeModules);

    expect(intake.applicationStatus).toBe("inbox");
    expect(intake.jobCandidateId).toBe(candidate.id);
    expect(intake.resumeAngle).toBeTruthy();
  });
});

describe("buildJobScoutStats and locks", () => {
  it("counts manual candidates by origin", () => {
    const candidates: JobCandidate[] = [
      createJobCandidate(
        {
          company: "A",
          roleTitle: "Engineer",
          description: "Python",
          roleType: "software",
          origin: "manual"
        },
        seedResumeModules
      ),
      createJobCandidate(
        {
          company: "B",
          roleTitle: "Engineer",
          description: "Python",
          roleType: "software",
          origin: "agent"
        },
        seedResumeModules
      )
    ];

    expect(countManualCandidates(candidates)).toBe(1);
  });

  it("builds scout stats and briefing signals", () => {
    const stats = buildJobScoutStats(seedJobCandidates, seedResumeModules, seedJobSources, []);
    const signals = buildCandidateBriefingSignals(seedJobCandidates, seedJobSources, []);

    expect(stats.activeResumeModules).toBeGreaterThan(0);
    expect(stats.candidatesSaved).toBeGreaterThanOrEqual(1);
    expect(stats.enabledSources).toBeGreaterThan(0);
    expect(signals.enabledSources).toBeGreaterThan(0);
  });

  it("enables manual-run fetching and locks scheduled fetching", () => {
    const locks = checkJobScoutLocks(seedJobCandidates, [], [], []);
    const manualRunLock = locks.find((lock) => lock.id === "manual-run-fetching");
    const scheduledLock = locks.find((lock) => lock.id === "scheduled-fetching");

    expect(manualRunLock?.enabled).toBe(true);
    expect(scheduledLock?.required).toBe(5);
    expect(scheduledLock?.current).toBe(0);
  });
});
