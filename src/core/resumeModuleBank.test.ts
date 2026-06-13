import { describe, expect, it } from "vitest";

import {
  buildCandidateResumePacket,
  buildResumeDraftPacket,
  buildResumeModuleReadinessSummary,
  buildResumePacketFromSelection,
  groupActiveResumeModules,
  normalizeResumeModules,
  refreshResumeDraftPacketSelection
} from "./resumeModuleBank";
import type { JobCandidate, ResumeModule } from "./types";

const modules: ResumeModule[] = [
  {
    id: "project-late",
    title: "Late Project",
    category: "project",
    summary: "Later project.",
    tags: ["typescript"],
    bullets: ["Built later project"],
    skills: ["TypeScript"],
    bestFor: ["software"],
    proof: ["Demo shipped"],
    isActive: true,
    resumePlacement: {
      section: "projects",
      heading: "Late Project",
      date: "2026",
      order: 20
    }
  },
  {
    id: "project-early",
    title: "Early Project",
    category: "project",
    summary: "Earlier project.",
    tags: ["react"],
    bullets: ["Built earlier project"],
    skills: ["React"],
    bestFor: ["software"],
    proof: ["Repository exists"],
    isActive: true,
    resumePlacement: {
      section: "projects",
      heading: "Early Project",
      date: "2025",
      order: 10
    }
  },
  {
    id: "skills",
    title: "Technical Skills",
    category: "skill_cluster",
    summary: "Core stack.",
    tags: [],
    bullets: [],
    skills: [],
    bestFor: ["software"],
    isActive: true,
    resumePlacement: {
      section: "skills",
      heading: "Technical",
      order: 10
    }
  },
  {
    id: "old-education",
    title: "Old Education",
    category: "education",
    summary: "Old persisted module without placement.",
    tags: [],
    bullets: ["Studied computer science"],
    skills: ["computer science"],
    bestFor: ["software"],
    isActive: true
  },
  {
    id: "inactive",
    title: "Inactive Module",
    category: "experience",
    summary: "Not active.",
    tags: [],
    bullets: [],
    skills: [],
    bestFor: ["other"],
    isActive: false
  }
];

describe("resume module bank", () => {
  it("defaults old modules from category and fallback order", () => {
    const normalized = normalizeResumeModules(modules);
    const education = normalized.find((module) => module.id === "old-education");

    expect(education?.resumePlacement).toMatchObject({
      section: "education",
      heading: "Old Education",
      order: 3
    });
  });

  it("groups active modules by resume section and placement order", () => {
    const groups = groupActiveResumeModules(modules);

    expect(groups.map((group) => group.section)).toEqual([
      "education",
      "skills",
      "projects",
      "additional_experience"
    ]);
    expect(groups.find((group) => group.section === "projects")?.modules.map((m) => m.id)).toEqual([
      "project-early",
      "project-late"
    ]);
  });

  it("reports readiness issues for missing bullets, skills, dates, and proof", () => {
    const summary = buildResumeModuleReadinessSummary(modules);

    expect(summary.active).toBe(4);
    expect(summary.inactive).toBe(1);
    expect(summary.bySection.projects).toBe(2);
    expect(summary.issues.map((issue) => issue.message)).toContain("No resume bullets yet.");
    expect(summary.issues.map((issue) => issue.message)).toContain("Skill group has no skills.");
    expect(summary.issues.map((issue) => issue.message)).toContain("Missing resume date.");
    expect(summary.issues.map((issue) => issue.message)).toContain("No proof attached.");
  });

  it("builds a deterministic candidate resume packet from suggested module ids", () => {
    const candidate: Pick<JobCandidate, "suggestedResumeModuleIds" | "roleType"> = {
      suggestedResumeModuleIds: ["project-late", "skills", "missing"],
      roleType: "software"
    };

    const packet = buildCandidateResumePacket(candidate, modules);

    expect(packet.modules.map((module) => module.id)).toEqual(["skills", "project-late"]);
    expect(packet.sectionCoverage).toEqual(["skills", "projects"]);
    expect(packet.missingEvidence.length).toBeGreaterThan(0);
    expect(packet.nextTinyAction).toBe("Patch Technical Skills: No resume bullets yet.");
  });

  it("creates a persisted draft packet snapshot with module ids and warning text", () => {
    const candidate: Pick<
      JobCandidate,
      "id" | "company" | "roleTitle" | "recommendedResumeAngle" | "suggestedResumeModuleIds" | "roleType"
    > = {
      id: "candidate-test",
      company: "Packet Co",
      roleTitle: "Software Engineer",
      recommendedResumeAngle: "Lead with TypeScript systems.",
      suggestedResumeModuleIds: ["project-late", "skills", "project-early"],
      roleType: "software"
    };

    const packet = buildResumeDraftPacket(
      candidate,
      modules,
      "2026-06-10T12:00:00.000Z"
    );

    expect(packet).toMatchObject({
      createdAt: "2026-06-10T12:00:00.000Z",
      sourceCandidateId: "candidate-test",
      company: "Packet Co",
      roleTitle: "Software Engineer",
      resumeAngle: "Lead with TypeScript systems.",
      nextTinyAction: "Patch Technical Skills: No resume bullets yet."
    });
    expect(packet.selectedModuleIds).toEqual(["skills", "project-early", "project-late"]);
    expect(packet.sectionCoverage).toEqual(["skills", "projects"]);
    expect(packet.missingEvidence.map((issue) => issue.message)).toContain("No proof attached.");
  });

  it("refreshes packet metadata from explicit selected module ids", () => {
    const base = buildResumeDraftPacket(
      {
        id: "candidate-test",
        company: "Packet Co",
        roleTitle: "Software Engineer",
        suggestedResumeModuleIds: ["project-late"],
        roleType: "software"
      },
      modules,
      "2026-06-10T12:00:00.000Z"
    );

    const refreshed = refreshResumeDraftPacketSelection(
      base,
      ["project-late", "old-education"],
      modules,
      "software"
    );

    expect(refreshed.selectedModuleIds).toEqual(["old-education", "project-late"]);
    expect(refreshed.sectionCoverage).toEqual(["education", "projects"]);
    expect(refreshed.company).toBe("Packet Co");
  });

  it("builds selection metadata with education when only project was suggested", () => {
    const selection = buildResumePacketFromSelection(
      ["project-late", "old-education"],
      modules,
      "other"
    );

    expect(selection.sectionCoverage).toEqual(["education", "projects"]);
    expect(selection.selectedModuleIds).toEqual(["old-education", "project-late"]);
  });

  it("creates an empty packet with a manual next action when no modules match", () => {
    const packet = buildResumeDraftPacket(
      {
        id: "candidate-empty",
        company: "Empty Co",
        roleTitle: "IT Specialist",
        suggestedResumeModuleIds: ["missing"],
        roleType: "it"
      },
      modules,
      "2026-06-10T12:00:00.000Z"
    );

    expect(packet.selectedModuleIds).toEqual([]);
    expect(packet.sectionCoverage).toEqual([]);
    expect(packet.nextTinyAction).toBe("Choose one active resume module for this it role.");
  });
});
