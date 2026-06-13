import { describe, expect, it } from "vitest";

import { createCareerApplicationCard } from "./career";
import { buildCareerMorningLoop } from "./careerMorningLoop";
import { SOURCE_HEALTH_STALE_DAYS } from "./jobSourceHealth";
import type {
  JobCandidate,
  JobSource,
  JobSourceRunResult,
  LifeCard,
  ResumeDraftPacket,
  ResumeModule
} from "./types";

const NOW = new Date("2026-06-11T12:00:00.000Z");

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

function run(partial: Partial<JobSourceRunResult> & Pick<JobSourceRunResult, "fetchedAt">): JobSourceRunResult {
  return {
    sourceId: "source-1",
    createdCandidateIds: [],
    skippedDuplicates: 0,
    errors: [],
    message: "ok",
    ...partial
  };
}

function packet(overrides: Partial<ResumeDraftPacket> = {}): ResumeDraftPacket {
  return {
    createdAt: "2026-06-11T00:00:00.000Z",
    sourceCandidateId: "candidate-1",
    company: "Example Co",
    roleTitle: "Software Engineer",
    resumeAngle: "TypeScript product engineer.",
    selectedModuleIds: ["resume-1"],
    sectionCoverage: ["projects"],
    missingEvidence: [],
    nextTinyAction: "Export DOCX and review manually.",
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
      applicationStatus: "active",
      resumeDraftPacket: packet()
    }),
    id: "card-1",
    title: "Qualcomm - Security Engineer",
    state: "active",
    ...overrides
  };
}

function loop(input: {
  jobCandidates?: JobCandidate[];
  cards?: LifeCard[];
  resumeModules?: ResumeModule[];
  jobSources?: JobSource[];
  jobSourceRuns?: JobSourceRunResult[];
  isBatchRunning?: boolean;
  batchRunProgress?: { current: number; total: number; sourceName: string };
}) {
  return buildCareerMorningLoop({
    jobCandidates: input.jobCandidates ?? [],
    cards: input.cards ?? [],
    jobSources: input.jobSources ?? [],
    jobSourceRuns: input.jobSourceRuns ?? [],
    resumeModules: input.resumeModules ?? [resumeModule()],
    now: NOW,
    isBatchRunning: input.isBatchRunning,
    batchRunProgress: input.batchRunProgress
  });
}

describe("buildCareerMorningLoop", () => {
  it("returns batch_running when a batch is already running", () => {
    const result = loop({
      jobSources: [source({ cadence: "daily" })],
      isBatchRunning: true,
      batchRunProgress: { current: 1, total: 2, sourceName: "Acme Source" }
    });

    expect(result.nextMove.kind).toBe("batch_running");
    expect(result.nextMove.disabled).toBe(true);
    expect(result.nextMove.why).toContain("Acme Source");
    expect(result.nextMove.why).toContain("Hang tight");
    expect(result.nextMove.ctaLabel).toBe("Running…");
  });

  it("suggests run due sources when sources are due", () => {
    const result = loop({
      jobSources: [source({ cadence: "daily" })]
    });

    expect(result.nextMove.kind).toBe("run_due_sources");
    expect(result.nextMove.batchHandler).toBe("run_due");
    expect(result.nextMove.ctaLabel).toBe("Run due sources");
    expect(result.nextMove.why).toContain("skim any new matches");
    expect(result.status.dueSourceCount).toBe(1);
  });

  it("suggests run enabled sources with honest copy when sources failed", () => {
    const staleDays = SOURCE_HEALTH_STALE_DAYS + 1;
    const fetchedAt = new Date(NOW.getTime() - staleDays * 24 * 60 * 60 * 1000).toISOString();
    const result = loop({
      jobSources: [
        source({
          id: "source-1",
          cadence: "manual",
          runStatus: "error",
          lastRunAt: fetchedAt,
          lastRunMessage: "Fetch failed."
        })
      ],
      jobSourceRuns: [
        run({
          fetchedAt,
          errors: ["timeout"]
        })
      ]
    });

    expect(result.nextMove.kind).toBe("run_enabled_sources");
    expect(result.nextMove.batchHandler).toBe("run_all_enabled");
    expect(result.nextMove.title).toBe("Run enabled sources");
    expect(result.nextMove.ctaLabel).toBe("Run all enabled");
    expect(result.nextMove.why).toContain("failed last time");
    expect(result.status.failedSourceCount).toBe(1);
  });

  it("suggests reviewing candidates on /job-candidates when queue has matches", () => {
    const result = loop({
      jobCandidates: [candidate()],
      jobSources: [
        source({
          cadence: "manual",
          runStatus: "success",
          lastRunAt: "2026-06-10T12:00:00.000Z"
        })
      ],
      jobSourceRuns: [
        run({
          fetchedAt: "2026-06-10T12:00:00.000Z",
          createdCandidateIds: ["candidate-old"]
        })
      ]
    });

    expect(result.nextMove.kind).toBe("review_candidates");
    expect(result.nextMove.href).toBe("/job-candidates");
    expect(result.nextMove.ctaLabel).toBe("Review matches");
    expect(result.nextMove.why).toContain("before running");
    expect(result.status.waitingCandidateCount).toBe(1);
  });

  it("suggests opening a ready-to-export application", () => {
    const educationModule = resumeModule({
      id: "education-module",
      title: "Education Module",
      category: "education",
      bullets: ["Completed security coursework."],
      proof: ["Transcript available."],
      resumePlacement: {
        section: "education",
        heading: "Arizona State University",
        detail: "Computer Science",
        date: "Expected 2026",
        order: 10
      }
    });
    const skillsModule = resumeModule({
      id: "skills-module",
      title: "Skills Module",
      category: "skill_cluster",
      bullets: [],
      skills: ["TypeScript", "React", "FastAPI"],
      proof: ["Used in shipped projects."],
      resumePlacement: {
        section: "skills",
        heading: "Technical",
        order: 10
      }
    });
    const projectModule = resumeModule({
      id: "project-module",
      title: "Project Module",
      category: "project",
      bullets: ["Built 3 deterministic resume checks."],
      proof: ["Demoed the project."],
      resumePlacement: {
        section: "projects",
        heading: "Project Module",
        detail: "TypeScript",
        date: "2026",
        order: 10
      }
    });
    const readyModules = [educationModule, skillsModule, projectModule];
    const result = loop({
      jobCandidates: [],
      cards: [
        applicationCard({
          careerApplication: {
            ...applicationCard().careerApplication!,
            resumeDraftPacket: packet({
              selectedModuleIds: ["education-module", "skills-module", "project-module"]
            })
          }
        })
      ],
      resumeModules: readyModules,
      jobSources: []
    });

    expect(result.nextMove.kind).toBe("open_application");
    expect(result.nextMove.href).toBe("/card/card-1");
    expect(result.nextMove.ctaLabel).toBe("Open and export resume");
    expect(result.status.readyApplicationCount).toBe(1);
  });

  it("suggests improving resume readiness when packet is missing", () => {
    const card = createCareerApplicationCard({
      company: "Acme",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software",
      applicationStatus: "active"
    });
    const result = loop({
      cards: [{ ...card, id: "card-blocked", state: "active" }],
      jobSources: []
    });

    expect(result.nextMove.kind).toBe("improve_resume");
    expect(result.nextMove.href).toBe("/card/card-blocked");
    expect(result.nextMove.ctaLabel).toBe("Fix resume blockers");
    expect(result.status.needsResumeCount).toBe(1);
  });

  it("suggests pasting a job on /candidate-intake when career state is empty", () => {
    const result = loop({
      jobCandidates: [],
      cards: [],
      jobSources: [],
      resumeModules: [resumeModule()]
    });

    expect(result.nextMove.kind).toBe("paste_job");
    expect(result.nextMove.href).toBe("/candidate-intake");
    expect(result.nextMove.why).toContain("sources can wait");
  });

  it("suggests run healthy sources when feeds are healthy but queue is empty", () => {
    const fetchedAt = "2026-06-10T12:00:00.000Z";
    const result = loop({
      jobCandidates: [],
      cards: [],
      jobSources: [
        source({
          cadence: "manual",
          runStatus: "success",
          lastRunAt: fetchedAt
        })
      ],
      jobSourceRuns: [
        run({
          fetchedAt,
          createdCandidateIds: ["c1"]
        })
      ]
    });

    expect(result.nextMove.kind).toBe("run_healthy_sources");
    expect(result.nextMove.batchHandler).toBe("run_healthy");
    expect(result.nextMove.why).toContain("worked before");
  });

  it("uses a friendly last-fetch supporting line when the last run had no errors", () => {
    const result = loop({
      jobSources: [source({ cadence: "daily" })],
      jobSourceRuns: [
        run({
          fetchedAt: "2026-06-10T08:00:00.000Z",
          createdCandidateIds: ["c1", "c2"]
        })
      ]
    });

    expect(result.supportingLines.some((line) => line === "Last fetch: 2 new matches")).toBe(true);
  });

  it("includes a supporting line when a last run exists", () => {
    const result = loop({
      jobSources: [source({ cadence: "daily" })],
      jobSourceRuns: [
        run({
          fetchedAt: "2026-06-10T08:00:00.000Z",
          createdCandidateIds: ["c1"]
        })
      ]
    });

    expect(result.supportingLines.some((line) => line.startsWith("Last fetch:"))).toBe(true);
  });
});
