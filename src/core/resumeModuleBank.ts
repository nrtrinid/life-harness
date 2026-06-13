import type {
  JobCandidate,
  ResumeDraftPacket,
  ResumeModule,
  ResumeModuleCategory,
  ResumeModulePlacement,
  ResumeModuleSection
} from "./types";

export const RESUME_MODULE_SECTION_ORDER: ResumeModuleSection[] = [
  "education",
  "skills",
  "projects",
  "additional_experience"
];

export const RESUME_MODULE_SECTION_LABELS: Record<ResumeModuleSection, string> = {
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  additional_experience: "Additional Experience"
};

export interface ResumeModuleIssue {
  moduleId: string;
  moduleTitle: string;
  message: string;
}

export interface ResumeModuleSectionGroup {
  section: ResumeModuleSection;
  label: string;
  modules: ResumeModule[];
}

export interface ResumeModuleReadinessSummary {
  total: number;
  active: number;
  inactive: number;
  bySection: Record<ResumeModuleSection, number>;
  issues: ResumeModuleIssue[];
}

export interface CandidateResumePacket {
  modules: ResumeModule[];
  sectionCoverage: ResumeModuleSection[];
  missingEvidence: ResumeModuleIssue[];
  nextTinyAction: string;
}

export type CandidateResumePacketInput = Pick<
  JobCandidate,
  | "id"
  | "company"
  | "roleTitle"
  | "recommendedResumeAngle"
  | "suggestedResumeModuleIds"
  | "roleType"
>;

function defaultSectionForCategory(category: ResumeModuleCategory): ResumeModuleSection {
  if (category === "education") {
    return "education";
  }
  if (category === "skill_cluster") {
    return "skills";
  }
  if (category === "project") {
    return "projects";
  }
  return "additional_experience";
}

export function normalizeResumeModulePlacement(
  module: ResumeModule,
  fallbackOrder: number
): ResumeModulePlacement {
  const section = module.resumePlacement?.section ?? defaultSectionForCategory(module.category);
  return {
    section,
    heading: module.resumePlacement?.heading?.trim() || module.title,
    detail: module.resumePlacement?.detail?.trim() || undefined,
    date: module.resumePlacement?.date?.trim() || undefined,
    order: Number.isFinite(module.resumePlacement?.order)
      ? module.resumePlacement!.order
      : fallbackOrder
  };
}

export function normalizeResumeModule(module: ResumeModule, fallbackOrder: number): ResumeModule {
  return {
    ...module,
    resumePlacement: normalizeResumeModulePlacement(module, fallbackOrder)
  };
}

export function normalizeResumeModules(modules: ResumeModule[]): ResumeModule[] {
  return modules.map((module, index) => normalizeResumeModule(module, index));
}

function compareModules(a: ResumeModule, b: ResumeModule): number {
  const aPlacement = normalizeResumeModulePlacement(a, 0);
  const bPlacement = normalizeResumeModulePlacement(b, 0);
  const sectionDelta =
    RESUME_MODULE_SECTION_ORDER.indexOf(aPlacement.section) -
    RESUME_MODULE_SECTION_ORDER.indexOf(bPlacement.section);
  if (sectionDelta !== 0) {
    return sectionDelta;
  }
  if (aPlacement.order !== bPlacement.order) {
    return aPlacement.order - bPlacement.order;
  }
  return aPlacement.heading.localeCompare(bPlacement.heading);
}

export function groupActiveResumeModules(
  modules: ResumeModule[]
): ResumeModuleSectionGroup[] {
  const normalized = normalizeResumeModules(modules).filter((module) => module.isActive);
  return RESUME_MODULE_SECTION_ORDER.map((section) => ({
    section,
    label: RESUME_MODULE_SECTION_LABELS[section],
    modules: normalized
      .filter((module) => module.resumePlacement?.section === section)
      .sort(compareModules)
  }));
}

function findModuleIssues(module: ResumeModule): ResumeModuleIssue[] {
  const placement = normalizeResumeModulePlacement(module, 0);
  const issues: ResumeModuleIssue[] = [];
  const add = (message: string) => {
    issues.push({ moduleId: module.id, moduleTitle: module.title, message });
  };

  if (module.bullets.length === 0) {
    add("No resume bullets yet.");
  }
  if (placement.section === "skills" && module.skills.length === 0) {
    add("Skill group has no skills.");
  }
  if (placement.section !== "skills" && !placement.date) {
    add("Missing resume date.");
  }
  if (!module.proof || module.proof.length === 0) {
    add("No proof attached.");
  }

  return issues;
}

export function buildResumeModuleReadinessSummary(
  modules: ResumeModule[]
): ResumeModuleReadinessSummary {
  const normalized = normalizeResumeModules(modules);
  const bySection = Object.fromEntries(
    RESUME_MODULE_SECTION_ORDER.map((section) => [section, 0])
  ) as Record<ResumeModuleSection, number>;

  const issues: ResumeModuleIssue[] = [];
  for (const module of normalized) {
    if (!module.isActive) {
      continue;
    }
    const section = module.resumePlacement?.section ?? defaultSectionForCategory(module.category);
    bySection[section] += 1;
    issues.push(...findModuleIssues(module));
  }

  return {
    total: normalized.length,
    active: normalized.filter((module) => module.isActive).length,
    inactive: normalized.filter((module) => !module.isActive).length,
    bySection,
    issues
  };
}

export function buildCandidateResumePacket(
  candidate: Pick<JobCandidate, "suggestedResumeModuleIds" | "roleType">,
  modules: ResumeModule[]
): CandidateResumePacket {
  const normalized = normalizeResumeModules(modules);
  const moduleById = new Map(normalized.map((module) => [module.id, module]));
  const selected = candidate.suggestedResumeModuleIds
    .map((id) => moduleById.get(id))
    .filter((module): module is ResumeModule => Boolean(module))
    .filter((module) => module.isActive)
    .sort(compareModules);
  const missingEvidence = selected.flatMap(findModuleIssues);
  const sectionCoverage = RESUME_MODULE_SECTION_ORDER.filter((section) =>
    selected.some((module) => module.resumePlacement?.section === section)
  );

  let nextTinyAction = "Pick one suggested module and tighten one bullet.";
  if (selected.length === 0) {
    nextTinyAction = `Choose one active resume module for this ${candidate.roleType} role.`;
  } else if (missingEvidence.length > 0) {
    nextTinyAction = missingEvidence[0].message.includes("proof")
      ? `Attach one proof item to ${missingEvidence[0].moduleTitle}.`
      : `Patch ${missingEvidence[0].moduleTitle}: ${missingEvidence[0].message}`;
  }

  return {
    modules: selected,
    sectionCoverage,
    missingEvidence,
    nextTinyAction
  };
}

export function buildResumePacketFromSelection(
  selectedModuleIds: string[],
  modules: ResumeModule[],
  roleType?: string
): Pick<ResumeDraftPacket, "selectedModuleIds" | "sectionCoverage" | "missingEvidence" | "nextTinyAction"> {
  const normalized = normalizeResumeModules(modules);
  const moduleById = new Map(normalized.map((module) => [module.id, module]));
  const selected = selectedModuleIds
    .map((id) => moduleById.get(id))
    .filter((module): module is ResumeModule => Boolean(module))
    .filter((module) => module.isActive)
    .sort(compareModules);
  const missingEvidence = selected.flatMap(findModuleIssues);
  const sectionCoverage = RESUME_MODULE_SECTION_ORDER.filter((section) =>
    selected.some(
      (module) => normalizeResumeModulePlacement(module, 0).section === section
    )
  );

  let nextTinyAction = "Pick one suggested module and tighten one bullet.";
  if (selected.length === 0) {
    nextTinyAction = roleType
      ? `Choose one active resume module for this ${roleType} role.`
      : "Select one active resume module for this application.";
  } else if (missingEvidence.length > 0) {
    nextTinyAction = missingEvidence[0].message.includes("proof")
      ? `Attach one proof item to ${missingEvidence[0].moduleTitle}.`
      : `Patch ${missingEvidence[0].moduleTitle}: ${missingEvidence[0].message}`;
  }

  return {
    selectedModuleIds: selected.map((module) => module.id),
    sectionCoverage,
    missingEvidence: missingEvidence.map((issue) => ({ ...issue })),
    nextTinyAction
  };
}

export function refreshResumeDraftPacketSelection(
  packet: ResumeDraftPacket,
  selectedModuleIds: string[],
  modules: ResumeModule[],
  roleType?: string
): ResumeDraftPacket {
  return {
    ...packet,
    ...buildResumePacketFromSelection(selectedModuleIds, modules, roleType)
  };
}

export function buildResumeDraftPacket(
  candidate: CandidateResumePacketInput,
  modules: ResumeModule[],
  createdAt: string
): ResumeDraftPacket {
  const preview = buildCandidateResumePacket(candidate, modules);

  return {
    createdAt,
    sourceCandidateId: candidate.id,
    company: candidate.company,
    roleTitle: candidate.roleTitle,
    resumeAngle: candidate.recommendedResumeAngle ?? `Review resume bank manually for this ${candidate.roleType} role.`,
    selectedModuleIds: preview.modules.map((module) => module.id),
    sectionCoverage: preview.sectionCoverage,
    missingEvidence: preview.missingEvidence.map((issue) => ({ ...issue })),
    nextTinyAction: preview.nextTinyAction
  };
}
