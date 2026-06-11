import { describe, expect, it } from "vitest";

import type { CareerSourcePackV1 } from "./careerSourcePack";
import { buildApplicationResumeReadiness } from "./resumeReadiness";
import type { LifeCard, ResumeDraftPacket, ResumeModule } from "./types";

function moduleFixture(overrides: Partial<ResumeModule> = {}): ResumeModule {
  return {
    id: "project-module",
    title: "Project Module",
    category: "project",
    summary: "Built a useful project with measurable output.",
    tags: ["typescript"],
    bullets: ["Built 3 deterministic resume checks."],
    skills: ["TypeScript"],
    bestFor: ["software"],
    proof: ["Demoed the project."],
    isActive: true,
    resumePlacement: {
      section: "projects",
      heading: "Project Module",
      detail: "TypeScript",
      date: "2026",
      order: 10
    },
    ...overrides
  };
}

const educationModule = moduleFixture({
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

const skillsModule = moduleFixture({
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

const projectModule = moduleFixture({
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

function packet(overrides: Partial<ResumeDraftPacket> = {}): ResumeDraftPacket {
  return {
    createdAt: "2026-06-11T00:00:00.000Z",
    sourceCandidateId: "candidate-1",
    company: "Example Co",
    roleTitle: "Software Engineer",
    resumeAngle: "TypeScript product engineer.",
    selectedModuleIds: ["education-module", "skills-module", "project-module"],
    sectionCoverage: ["education", "skills", "projects"],
    missingEvidence: [],
    nextTinyAction: "Review selected modules.",
    ...overrides
  };
}

function applicationCard(packetOverride: ResumeDraftPacket | null = packet()): LifeCard {
  return {
    id: "card-1",
    title: "Example Co - Software Engineer",
    area: "social_career",
    state: "inbox",
    progress: 0,
    warmth: "warm",
    nextTinyAction: "Tailor resume angle and submit application.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    careerApplication: {
      company: "Example Co",
      roleTitle: "Software Engineer",
      jobDescription: "TypeScript React role.",
      roleType: "software",
      applicationStatus: "inbox",
      resumeDraftPacket: packetOverride ?? undefined
    }
  };
}

function packFixture(overrides: Partial<CareerSourcePackV1> = {}): CareerSourcePackV1 {
  return {
    careerPositioning: {
      headline: "Software engineer",
      summary: "Builds useful tools.",
      currentPositioning: [],
      bestDefaultProjectOrder: [],
      defaultResumeFormula: [],
      privacyNotes: []
    },
    resumeModules: [
      {
        id: "project-module",
        title: "Project Module",
        category: "project",
        summary: "Project.",
        tags: [],
        skills: [],
        bullets: [],
        bestFor: ["software"],
        proof: [],
        sourceFiles: ["resume.md"],
        confidence: "medium",
        claimsToAvoid: ["Do not claim production scale without proof."],
        metricsToGather: [],
        isActive: true
      }
    ],
    roleRecipes: [],
    jobScoutFilters: {
      roleRecipeFilters: [],
      projectMatchFilters: [],
      skillFilters: [],
      locationPreferenceNotes: [],
      seniorityPositiveSignals: [],
      seniorityNegativeSignals: [],
      clearanceSignals: [],
      publicSectorSignals: [],
      excludeOrCautionSignals: []
    },
    claimsSafety: {
      globalClaimsToAvoid: [],
      safePhrasingRules: [],
      unsupportedClaims: [],
      needsEvidenceBeforeUsing: []
    },
    metricsToGather: [],
    interviewStories: [],
    matchingHints: {
      roleKeywordMap: {},
      moduleKeywordMap: {},
      strongFitCombinations: [],
      weakFitWarnings: []
    },
    extractionMetadata: {
      schemaVersion: 1,
      generatedAt: "2026-06-11T00:00:00.000Z",
      warnings: []
    },
    ...overrides
  };
}

const readyModules = [educationModule, skillsModule, projectModule];

describe("buildApplicationResumeReadiness", () => {
  it("blocks an application card with no resume draft packet", () => {
    const result = buildApplicationResumeReadiness({
      card: applicationCard(null),
      resumeModules: readyModules
    });

    expect(result.status).toBe("blocked");
    expect(result.exportReadiness.canExportDocx).toBe(false);
    expect(result.nextTinyResumeAction).toBe("Create the resume draft packet for this application.");
  });

  it("blocks when selected modules are missing or inactive", () => {
    const result = buildApplicationResumeReadiness({
      card: applicationCard(packet({ selectedModuleIds: ["missing-module"] })),
      resumeModules: readyModules
    });

    expect(result.status).toBe("blocked");
    expect(result.exportReadiness.canExportDocx).toBe(false);
    expect(result.warnings.map((warning) => warning.category)).toContain("missing_selected_module");
  });

  it("marks selected modules with missing date and proof as patch-worthy", () => {
    const weakProject = moduleFixture({
      id: "project-module",
      title: "Backend Project",
      proof: [],
      resumePlacement: {
        section: "projects",
        heading: "Backend Project",
        detail: "Node",
        order: 10
      }
    });

    const result = buildApplicationResumeReadiness({
      card: applicationCard(),
      resumeModules: [educationModule, skillsModule, weakProject]
    });

    expect(result.status).toBe("needs_patch");
    expect(result.exportReadiness.canExportDocx).toBe(false);
    expect(result.warnings.map((warning) => warning.category)).toEqual(
      expect.arrayContaining(["missing_date", "missing_proof"])
    );
    expect(result.nextTinyResumeAction).toBe("Add a date to the Backend Project module.");
  });

  it("keeps claims cautions patch-worthy but exportable", () => {
    const result = buildApplicationResumeReadiness({
      card: applicationCard(),
      resumeModules: readyModules,
      careerSourcePack: packFixture()
    });

    expect(result.status).toBe("needs_patch");
    expect(result.exportReadiness.canExportDocx).toBe(true);
    expect(result.warnings.map((warning) => warning.category)).toContain("claims_caution");
    expect(result.nextTinyResumeAction).toBe("Review the claims caution before exporting.");
  });

  it("is ready when selected modules are structurally complete and safe", () => {
    const result = buildApplicationResumeReadiness({
      card: applicationCard(),
      resumeModules: readyModules
    });

    expect(result.status).toBe("ready_to_export");
    expect(result.exportReadiness.canExportDocx).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.nextTinyResumeAction).toBe("Export DOCX and review manually.");
  });

  it("keeps next tiny action priority stable", () => {
    const result = buildApplicationResumeReadiness({
      card: applicationCard(packet({ selectedModuleIds: ["project-module"] })),
      resumeModules: [
        moduleFixture({
          id: "project-module",
          title: "Project Without Date",
          resumePlacement: {
            section: "projects",
            heading: "Project Without Date",
            order: 10
          }
        })
      ]
    });

    expect(result.nextTinyResumeAction).toBe("Select one Education module.");
  });

  it("disables DOCX export when readiness is blocked", () => {
    const result = buildApplicationResumeReadiness({
      card: applicationCard(packet({ selectedModuleIds: [] })),
      resumeModules: readyModules
    });

    expect(result.status).toBe("blocked");
    expect(result.exportReadiness.canExportDocx).toBe(false);
  });

  it("allows DOCX export for ready or non-structural patch-worthy packets", () => {
    const ready = buildApplicationResumeReadiness({
      card: applicationCard(),
      resumeModules: readyModules
    });
    const patchWorthy = buildApplicationResumeReadiness({
      card: applicationCard(),
      resumeModules: readyModules,
      careerSourcePack: packFixture({
        metricsToGather: [
          {
            moduleId: "project-module",
            metric: "Add shipped-user count.",
            whyItMatters: "Concrete proof beats vague claims.",
            status: "missing"
          }
        ],
        resumeModules: []
      })
    });

    expect(ready.exportReadiness.canExportDocx).toBe(true);
    expect(patchWorthy.status).toBe("needs_patch");
    expect(patchWorthy.exportReadiness.canExportDocx).toBe(true);
    expect(patchWorthy.warnings.map((warning) => warning.category)).toContain("missing_metrics");
  });
});
