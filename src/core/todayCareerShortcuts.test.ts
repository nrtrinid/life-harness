import { describe, expect, it } from "vitest";

import { buildCareerHubSummary } from "./careerHub";
import { buildTodayCareerShortcuts } from "./todayCareerShortcuts";
import type { JobCandidate, JobSource, ResumeModule } from "./types";

const NOW = new Date("2026-06-13T12:00:00.000Z");

function candidate(overrides: Partial<JobCandidate> = {}): JobCandidate {
  return {
    id: "candidate-1",
    company: "Acme",
    roleTitle: "Engineer",
    description: "Build things",
    roleType: "software",
    discoveredAt: NOW.toISOString(),
    status: "new",
    origin: "manual",
    fitScore: 72,
    fitReasons: ["Strong stack overlap"],
    gaps: [],
    suggestedResumeModuleIds: [],
    nextTinyAction: "Review match",
    ...overrides
  };
}

function resumeModule(overrides: Partial<ResumeModule> = {}): ResumeModule {
  return {
    id: "resume-1",
    title: "Project Module",
    category: "project",
    summary: "Useful source material.",
    tags: ["typescript"],
    bullets: ["Built a useful thing."],
    skills: ["TypeScript"],
    bestFor: ["software"],
    isActive: true,
    ...overrides
  };
}

function source(overrides: Partial<JobSource> = {}): JobSource {
  return {
    id: "source-1",
    name: "Test Source",
    url: "/fixtures/sample-greenhouse.json",
    kind: "greenhouse",
    enabled: true,
    cadence: "weekly",
    ...overrides
  };
}

function summaryFor(input: {
  jobCandidates?: JobCandidate[];
  jobSources?: JobSource[];
}) {
  return buildCareerHubSummary({
    jobCandidates: input.jobCandidates ?? [],
    cards: [],
    jobSources: input.jobSources ?? [],
    jobSourceRuns: [],
    resumeModules: [resumeModule()],
    hasCareerPack: false,
    now: NOW
  });
}

describe("buildTodayCareerShortcuts", () => {
  it("returns hub next action as primary and Jobs board as secondary", () => {
    const summary = summaryFor({ jobCandidates: [candidate()] });
    const shortcuts = buildTodayCareerShortcuts(summary, 0);

    expect(shortcuts[0]).toEqual({
      label: "Review matches",
      href: "/career?tab=review",
      kind: "primary"
    });
    expect(shortcuts[1]).toEqual({
      label: "Open Jobs board",
      href: "/career",
      kind: "secondary"
    });
    expect(shortcuts).toHaveLength(2);
  });

  it("adds run due sources when due and next action is not already find/sources", () => {
    const summary = summaryFor({ jobCandidates: [candidate()] });
    const shortcuts = buildTodayCareerShortcuts(summary, 2);

    expect(shortcuts.some((s) => s.label === "Run due sources (2)")).toBe(true);
  });

  it("skips run due sources when next action already points to find tab for sources", () => {
    const summary = summaryFor({
      jobSources: [source({ lastRunAt: "2026-01-01T00:00:00.000Z" })]
    });
    expect(summary.nextAction.tab).toBe("find");
    const shortcuts = buildTodayCareerShortcuts(summary, 3);

    expect(shortcuts.some((s) => s.label.includes("Run due sources"))).toBe(false);
  });
});
