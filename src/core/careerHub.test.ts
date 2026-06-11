import { describe, expect, it } from "vitest";

import { createCareerApplicationCard } from "./career";
import { buildCareerHubSummary } from "./careerHub";
import type { JobCandidate, JobSource, LifeCard, ResumeModule } from "./types";

const now = new Date("2026-06-11T12:00:00.000Z");

function candidate(overrides: Partial<JobCandidate> = {}): JobCandidate {
  return {
    id: "candidate-1",
    company: "Northrop Grumman",
    roleTitle: "Software Engineer",
    description: "Software role with TypeScript and security.",
    roleType: "software",
    discoveredAt: "2026-06-10T12:00:00.000Z",
    origin: "manual",
    status: "saved",
    fitScore: 72,
    fitLabel: "possible",
    fitReasons: ["Matches TypeScript."],
    gaps: [],
    suggestedResumeModuleIds: ["resume-1"],
    nextTinyAction: "Review suggested modules and approve to application card.",
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
    name: "Manual Source",
    url: "/fixtures/sample-greenhouse.json",
    kind: "greenhouse",
    enabled: true,
    cadence: "manual",
    ...overrides
  };
}

function applicationCard(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    ...createCareerApplicationCard({
      company: "Qualcomm",
      roleTitle: "Security Engineer",
      jobDescription: "Application security role.",
      roleType: "cybersecurity",
      applicationStatus: "waiting",
      followUpDate: "2026-06-08"
    }),
    id: "card-1",
    title: "Qualcomm - Security Engineer",
    ...overrides
  };
}

function summary(input: {
  jobCandidates?: JobCandidate[];
  cards?: LifeCard[];
  resumeModules?: ResumeModule[];
  jobSources?: JobSource[];
  hasCareerPack?: boolean;
}) {
  return buildCareerHubSummary({
    jobCandidates: input.jobCandidates ?? [],
    cards: input.cards ?? [],
    resumeModules: input.resumeModules ?? [resumeModule()],
    jobSources: input.jobSources ?? [],
    jobSourceRuns: [],
    hasCareerPack: input.hasCareerPack ?? false,
    now
  });
}

describe("buildCareerHubSummary", () => {
  it("suggests the due follow-up before queue work", () => {
    const result = summary({
      jobCandidates: [candidate()],
      cards: [applicationCard()]
    });

    expect(result.nextAction.title).toContain("Follow up");
    expect(result.nextAction.href).toBe("/card/card-1");
    expect(result.followUpCount).toBe(1);
  });

  it("suggests opening the queue when a candidate is waiting", () => {
    const result = summary({
      jobCandidates: [candidate()],
      cards: []
    });

    expect(result.nextAction.title).toBe("Work the application queue");
    expect(result.nextAction.href).toBe("/career?tab=review");
    expect(result.queueCount).toBe(1);
  });

  it("suggests pasting a job when no candidates or applications exist", () => {
    const result = summary({
      jobCandidates: [],
      cards: []
    });

    expect(result.nextAction.title).toBe("Paste one job description");
    expect(result.nextAction.href).toBe("/career?add=1&tab=find");
  });

  it("suggests adding source material when resume artifacts are empty", () => {
    const result = summary({
      jobCandidates: [candidate({ status: "card_created" })],
      cards: [applicationCard({ careerApplication: undefined, state: "done" })],
      resumeModules: []
    });

    expect(result.nextAction.title).toBe("Add source material");
    expect(result.nextAction.href).toBe("/resume-bank");
    expect(result.resumeModuleCount).toBe(0);
  });

  it("falls back to pasting one job description when there is no better move", () => {
    const result = summary({
      jobCandidates: [candidate({ status: "card_created" })],
      cards: [],
      jobSources: [],
      resumeModules: [resumeModule()]
    });

    expect(result.nextAction.title).toBe("Paste one job description");
    expect(result.nextAction.href).toBe("/career?add=1&tab=find");
  });

  it("suggests approved sources when source material exists and no queue is waiting", () => {
    const result = summary({
      jobCandidates: [candidate({ status: "card_created" })],
      cards: [],
      jobSources: [source()],
      resumeModules: [resumeModule()]
    });

    expect(result.nextAction.title).toBe("Check approved sources");
    expect(result.nextAction.href).toBe("/career?tab=find");
    expect(result.enabledSourceCount).toBe(1);
  });
});
