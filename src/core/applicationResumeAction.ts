import type { CareerSourcePackV1 } from "./careerSourcePack";
import {
  buildApplicationResumeReadiness,
  type ApplicationResumeReadiness
} from "./resumeReadiness";
import {
  groupActiveResumeModules,
  normalizeResumeModulePlacement,
  RESUME_MODULE_SECTION_LABELS
} from "./resumeModuleBank";
import type {
  JobCandidate,
  LifeCard,
  ResumeModule,
  ResumeModuleSection
} from "./types";

const CRITICAL_SECTIONS: ResumeModuleSection[] = ["education", "skills", "projects"];
const APPLY_CARD_STATES = new Set(["inbox", "active", "waiting"]);

export type ApplicationResumePrimaryActionKind =
  | "create_packet"
  | "focus_section"
  | "patch_module"
  | "export"
  | "open_card";

export interface ApplicationResumePrimaryAction {
  kind: ApplicationResumePrimaryActionKind;
  label: string;
  focusSection?: ResumeModuleSection;
  moduleId?: string;
}

export interface ApplyQueueEntry {
  card: LifeCard;
  readiness: ApplicationResumeReadiness;
}

export interface ApplyQueueSortInput {
  cards: LifeCard[];
  resumeModules: ResumeModule[];
  jobCandidates?: JobCandidate[];
  careerSourcePack?: CareerSourcePackV1;
}

export function deriveApplicationResumePrimaryAction(
  readiness: ApplicationResumeReadiness
): ApplicationResumePrimaryAction {
  if (readiness.exportReadiness.reason === "Application card has no resume draft packet.") {
    return { kind: "create_packet", label: "Create draft packet" };
  }

  const sectionWarning = readiness.warnings.find(
    (warning) => warning.category === "missing_section_coverage" && warning.blocksExport
  );
  if (sectionWarning?.section) {
    return {
      kind: "focus_section",
      label: `Add ${RESUME_MODULE_SECTION_LABELS[sectionWarning.section]} module`,
      focusSection: sectionWarning.section
    };
  }

  const patchWarning = readiness.warnings.find(
    (warning) =>
      warning.blocksExport &&
      (warning.category === "missing_date" ||
        warning.category === "missing_bullets" ||
        warning.category === "missing_proof" ||
        warning.category === "missing_selected_module")
  );
  if (patchWarning) {
    return {
      kind: "patch_module",
      label: patchWarning.moduleTitle ? `Fix ${patchWarning.moduleTitle}` : "Fix module gap",
      moduleId: patchWarning.moduleId
    };
  }

  if (readiness.exportReadiness.canExportDocx) {
    return { kind: "export", label: "Build Resume DOCX" };
  }

  return { kind: "open_card", label: "Open application" };
}

export function currentResumePipelineStep(
  readiness: ApplicationResumeReadiness
): "pick" | "patch" | "export" {
  const action = deriveApplicationResumePrimaryAction(readiness);
  if (action.kind === "create_packet" || action.kind === "focus_section") {
    return "pick";
  }
  if (action.kind === "patch_module") {
    return "patch";
  }
  if (action.kind === "export") {
    return "export";
  }
  if (!readiness.exportReadiness.canExportDocx) {
    return "patch";
  }
  return "export";
}

export function suggestDefaultModuleIdsPerSection(
  resumeModules: ResumeModule[]
): Partial<Record<ResumeModuleSection, string>> {
  const groups = groupActiveResumeModules(resumeModules);
  const result: Partial<Record<ResumeModuleSection, string>> = {};
  for (const section of CRITICAL_SECTIONS) {
    const module = groups.find((group) => group.section === section)?.modules[0];
    if (module) {
      result[section] = module.id;
    }
  }
  return result;
}

function applyQueuePriority(entry: ApplyQueueEntry): number {
  const missingSection = entry.readiness.warnings.some(
    (warning) => warning.category === "missing_section_coverage" && warning.blocksExport
  );
  if (missingSection) {
    return 0;
  }
  if (entry.readiness.status === "blocked") {
    return 1;
  }
  if (entry.readiness.status === "needs_patch") {
    return 2;
  }
  return 3;
}

export function sortApplicationsForApplyQueue(input: ApplyQueueSortInput): ApplyQueueEntry[] {
  const entries = input.cards
    .filter(
      (card) => card.careerApplication && APPLY_CARD_STATES.has(card.state)
    )
    .map((card) => {
      const linkedCandidate = card.careerApplication?.jobCandidateId
        ? input.jobCandidates?.find(
            (candidate) => candidate.id === card.careerApplication?.jobCandidateId
          )
        : undefined;
      const readiness = buildApplicationResumeReadiness({
        card,
        resumeModules: input.resumeModules,
        jobCandidate: linkedCandidate,
        careerSourcePack: input.careerSourcePack
      });
      return { card, readiness };
    });

  return entries.sort((left, right) => {
    const priorityDelta = applyQueuePriority(left) - applyQueuePriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const leftTouched = left.card.lastTouched ?? "";
    const rightTouched = right.card.lastTouched ?? "";
    if (leftTouched !== rightTouched) {
      return rightTouched.localeCompare(leftTouched);
    }
    return left.card.title.localeCompare(right.card.title);
  });
}

export function buildPostApproveApplicationHref(
  cards: LifeCard[],
  resumeModules: ResumeModule[],
  cardId: string
): string {
  const card = cards.find((item) => item.id === cardId);
  if (!card) {
    return `/card/${cardId}`;
  }
  const readiness = buildApplicationResumeReadiness({ card, resumeModules });
  return buildCardResumeHref(cardId, deriveApplicationResumePrimaryAction(readiness));
}

export function buildCardResumeHref(
  cardId: string,
  action: ApplicationResumePrimaryAction
): string {
  if (action.kind === "focus_section" && action.focusSection) {
    return `/card/${cardId}?focusSection=${action.focusSection}`;
  }
  if (action.kind === "patch_module" && action.moduleId) {
    const params = new URLSearchParams({ patchModule: action.moduleId });
    if (action.focusSection) {
      params.set("focusSection", action.focusSection);
    }
    return `/card/${cardId}?${params.toString()}`;
  }
  return `/card/${cardId}`;
}
