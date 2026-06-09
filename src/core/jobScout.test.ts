import { describe, expect, it } from "vitest";

import {
  buildCareerIntakeFromCandidate,
  buildCandidateBriefingSignals,
  buildJobScoutStats,
  checkJobScoutLocks,
  countManualCandidates,
  createJobCandidate,
  createResumeModule,
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

describe("getFitTier", () => {
  it("maps score boundaries correctly", () => {
    expect(getFitTier(75)).toBe("strong");
    expect(getFitTier(74)).toBe("mixed");
    expect(getFitTier(45)).toBe("mixed");
    expect(getFitTier(44)).toBe("weak");
    expect(getFitTierLabel(80)).toBe("Strong fit");
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

  it("returns bounded deterministic score with reasons", () => {
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

    const suggested = getSuggestedResumeModules(candidate, seedResumeModules);
    expect(suggested.length).toBeGreaterThanOrEqual(2);
    expect(suggested.length).toBeLessThanOrEqual(4);
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
