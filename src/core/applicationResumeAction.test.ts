import { describe, expect, it } from "vitest";

import {
  buildCardResumeHref,
  deriveApplicationResumePrimaryAction,
  sortApplicationsForApplyQueue,
  suggestDefaultModuleIdsPerSection
} from "./applicationResumeAction";
import { buildApplicationResumeReadiness } from "./resumeReadiness";
import type { ApplicationResumeReadiness, ResumeReadinessWarning } from "./resumeReadiness";
import type { LifeCard, ResumeModule } from "./types";

function readinessFixture(
  partial: Partial<ApplicationResumeReadiness> & {
    warnings?: ResumeReadinessWarning[];
  }
): ApplicationResumeReadiness {
  return {
    status: "blocked",
    selectedModulesBySection: {
      education: [],
      skills: [],
      projects: [],
      additional_experience: []
    },
    warnings: [],
    exportReadiness: { canExportDocx: false, reason: "No resume modules selected." },
    nextTinyResumeAction: "Select one Education module.",
    ...partial
  };
}

describe("applicationResumeAction", () => {
  it("derives focus_section when education coverage is missing", () => {
    const action = deriveApplicationResumePrimaryAction(
      readinessFixture({
        exportReadiness: {
          canExportDocx: false,
          reason: "Education needs at least one selected module."
        },
        warnings: [
          {
            id: "w1",
            category: "missing_section_coverage",
            message: "Education needs at least one selected module.",
            section: "education",
            blocksExport: true
          }
        ]
      })
    );

    expect(action).toMatchObject({
      kind: "focus_section",
      label: "Add Education module",
      focusSection: "education"
    });
  });

  it("derives patch_module for blocking date warnings", () => {
    const action = deriveApplicationResumePrimaryAction(
      readinessFixture({
        status: "needs_patch",
        exportReadiness: { canExportDocx: false, reason: "Late Project is missing a resume date." },
        warnings: [
          {
            id: "w2",
            category: "missing_date",
            message: "Late Project is missing a resume date.",
            moduleId: "project-late",
            moduleTitle: "Late Project",
            blocksExport: true
          }
        ]
      })
    );

    expect(action).toMatchObject({
      kind: "patch_module",
      label: "Fix Late Project",
      moduleId: "project-late"
    });
  });

  it("builds card href with focus and patch params", () => {
    expect(
      buildCardResumeHref("card-1", {
        kind: "focus_section",
        label: "Add Education module",
        focusSection: "education"
      })
    ).toBe("/card/card-1?focusSection=education");
    expect(
      buildCardResumeHref("card-1", {
        kind: "patch_module",
        label: "Fix Late Project",
        moduleId: "project-late"
      })
    ).toBe("/card/card-1?patchModule=project-late");
  });

  it("suggests first active module per critical section", () => {
    const modules: ResumeModule[] = [
      {
        id: "edu-1",
        title: "Education",
        category: "education",
        summary: "",
        tags: [],
        bullets: [],
        skills: [],
        bestFor: ["software"],
        isActive: true,
        resumePlacement: { section: "education", heading: "School", order: 1 }
      },
      {
        id: "skills-1",
        title: "Skills",
        category: "skill_cluster",
        summary: "",
        tags: [],
        bullets: [],
        skills: ["TypeScript"],
        bestFor: ["software"],
        isActive: true,
        resumePlacement: { section: "skills", heading: "Stack", order: 1 }
      }
    ];

    expect(suggestDefaultModuleIdsPerSection(modules)).toEqual({
      education: "edu-1",
      skills: "skills-1"
    });
  });

  it("sorts apply queue with missing sections first", () => {
    const cards: LifeCard[] = [
      {
        id: "ready-card",
        title: "Ready Co",
        area: "social_career",
        state: "active",
        progress: 0,
        warmth: "hot",
        nextTinyAction: "Export",
        recentWins: [],
        openLoops: [],
        optimizationIdeas: [],
        proofItemIds: [],
        careerApplication: {
          company: "Ready Co",
          roleTitle: "Engineer",
          roleType: "software",
          applicationStatus: "active",
          jobDescription: "Build software",
          resumeAngle: "Lead with TypeScript",
          projectsToEmphasize: "App",
          resumeDraftPacket: {
            createdAt: "2026-01-01",
            sourceCandidateId: "c1",
            company: "Ready Co",
            roleTitle: "Engineer",
            resumeAngle: "Lead with TypeScript",
            selectedModuleIds: ["edu", "skills", "project"],
            sectionCoverage: ["education", "skills", "projects"],
            missingEvidence: [],
            nextTinyAction: "Export DOCX"
          }
        }
      },
      {
        id: "blocked-card",
        title: "Blocked Co",
        area: "social_career",
        state: "inbox",
        progress: 0,
        warmth: "warm",
        nextTinyAction: "Pick modules",
        recentWins: [],
        openLoops: [],
        optimizationIdeas: [],
        proofItemIds: [],
        careerApplication: {
          company: "Blocked Co",
          roleTitle: "Tech",
          roleType: "other",
          applicationStatus: "active",
          jobDescription: "Field work",
          resumeAngle: "Review manually",
          projectsToEmphasize: "Project",
          resumeDraftPacket: {
            createdAt: "2026-01-01",
            sourceCandidateId: "c2",
            company: "Blocked Co",
            roleTitle: "Tech",
            resumeAngle: "Review manually",
            selectedModuleIds: ["project"],
            sectionCoverage: ["projects"],
            missingEvidence: [],
            nextTinyAction: "Select one Education module."
          }
        }
      }
    ];

    const modules: ResumeModule[] = [
      {
        id: "edu",
        title: "Education",
        category: "education",
        summary: "",
        tags: [],
        bullets: ["Studied CS"],
        skills: [],
        bestFor: ["software"],
        proof: ["Transcript"],
        isActive: true,
        resumePlacement: {
          section: "education",
          heading: "School",
          date: "2026",
          order: 1
        }
      },
      {
        id: "skills",
        title: "Skills",
        category: "skill_cluster",
        summary: "",
        tags: [],
        bullets: [],
        skills: ["TypeScript"],
        bestFor: ["software"],
        isActive: true,
        resumePlacement: { section: "skills", heading: "Stack", order: 1 }
      },
      {
        id: "project",
        title: "Project",
        category: "project",
        summary: "",
        tags: [],
        bullets: ["Built app"],
        skills: [],
        bestFor: ["software"],
        proof: ["Demo"],
        isActive: true,
        resumePlacement: {
          section: "projects",
          heading: "App",
          date: "2025",
          order: 1
        }
      }
    ];

    const sorted = sortApplicationsForApplyQueue({ cards, resumeModules: modules });
    expect(sorted.map((entry) => entry.card.id)).toEqual(["blocked-card", "ready-card"]);
    expect(
      buildApplicationResumeReadiness({
        card: sorted[0]!.card,
        resumeModules: modules
      }).warnings.some((warning) => warning.category === "missing_section_coverage")
    ).toBe(true);
  });
});
