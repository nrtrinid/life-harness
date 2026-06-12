import type {
  CareerSourcePackV1,
  CareerPackMetricToGather
} from "./careerSourcePack";
import {
  normalizeResumeModulePlacement,
  normalizeResumeModules,
  RESUME_MODULE_SECTION_LABELS,
  RESUME_MODULE_SECTION_ORDER
} from "./resumeModuleBank";
import type {
  JobCandidate,
  LifeCard,
  ResumeDraftPacket,
  ResumeModule,
  ResumeModuleSection
} from "./types";

export type ApplicationResumeReadinessStatus =
  | "blocked"
  | "needs_patch"
  | "ready_to_export";

export type ResumeReadinessWarningCategory =
  | "missing_selected_module"
  | "missing_section_coverage"
  | "missing_date"
  | "missing_bullets"
  | "missing_proof"
  | "missing_metrics"
  | "claims_caution"
  | "weak_role_fit";

export interface ResumeReadinessWarning {
  id: string;
  category: ResumeReadinessWarningCategory;
  message: string;
  moduleId?: string;
  moduleTitle?: string;
  section?: ResumeModuleSection;
  blocksExport: boolean;
}

export interface ApplicationResumeReadiness {
  status: ApplicationResumeReadinessStatus;
  selectedModulesBySection: Record<ResumeModuleSection, ResumeModule[]>;
  warnings: ResumeReadinessWarning[];
  exportReadiness: {
    canExportDocx: boolean;
    reason?: string;
  };
  nextTinyResumeAction: string;
}

export interface ApplicationResumeReadinessInput {
  card: LifeCard;
  resumeModules: ResumeModule[];
  jobCandidate?: JobCandidate;
  careerSourcePack?: CareerSourcePackV1;
}

const CRITICAL_SECTIONS: ResumeModuleSection[] = ["education", "skills", "projects"];

function emptySectionGroups(): Record<ResumeModuleSection, ResumeModule[]> {
  return {
    education: [],
    skills: [],
    projects: [],
    additional_experience: []
  };
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function hasText(value: string | undefined): boolean {
  return clean(value).length > 0;
}

function hasMetricLikeText(module: ResumeModule): boolean {
  return [...module.bullets, module.summary, ...(module.proof ?? [])].some((text) =>
    /\d/.test(text)
  );
}

function addWarning(
  warnings: ResumeReadinessWarning[],
  warning: Omit<ResumeReadinessWarning, "id">
) {
  const id = [
    warning.category,
    warning.section,
    warning.moduleId,
    warning.message.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  ]
    .filter(Boolean)
    .join(":");

  if (!warnings.some((item) => item.id === id)) {
    warnings.push({ ...warning, id });
  }
}

function groupSelectedModules(selected: ResumeModule[]): Record<ResumeModuleSection, ResumeModule[]> {
  const groups = emptySectionGroups();
  for (const module of selected) {
    const placement = normalizeResumeModulePlacement(module, 0);
    groups[placement.section].push(module);
  }

  for (const section of RESUME_MODULE_SECTION_ORDER) {
    groups[section].sort((a, b) => {
      const aPlacement = normalizeResumeModulePlacement(a, 0);
      const bPlacement = normalizeResumeModulePlacement(b, 0);
      if (aPlacement.order !== bPlacement.order) {
        return aPlacement.order - bPlacement.order;
      }
      return aPlacement.heading.localeCompare(bPlacement.heading);
    });
  }

  return groups;
}

function selectedModulesFromPacket(
  packet: ResumeDraftPacket,
  resumeModules: ResumeModule[],
  warnings: ResumeReadinessWarning[]
): ResumeModule[] {
  const moduleById = new Map(
    normalizeResumeModules(resumeModules)
      .filter((module) => module.isActive)
      .map((module) => [module.id, module])
  );
  const selected: ResumeModule[] = [];

  for (const moduleId of packet.selectedModuleIds) {
    const module = moduleById.get(moduleId);
    if (!module) {
      addWarning(warnings, {
        category: "missing_selected_module",
        message: `Missing selected resume module: ${moduleId}.`,
        moduleId,
        blocksExport: true
      });
    } else {
      selected.push(module);
    }
  }

  return selected;
}

function addSectionCoverageWarnings(
  selectedBySection: Record<ResumeModuleSection, ResumeModule[]>,
  warnings: ResumeReadinessWarning[]
) {
  for (const section of CRITICAL_SECTIONS) {
    if (selectedBySection[section].length === 0) {
      addWarning(warnings, {
        category: "missing_section_coverage",
        message: `${RESUME_MODULE_SECTION_LABELS[section]} needs at least one selected module.`,
        section,
        blocksExport: true
      });
    }
  }
}

function addModuleContentWarnings(
  selected: ResumeModule[],
  warnings: ResumeReadinessWarning[]
) {
  for (const module of selected) {
    const placement = normalizeResumeModulePlacement(module, 0);
    const bullets = module.bullets.filter(hasText);

    if (placement.section !== "skills" && !hasText(placement.date)) {
      addWarning(warnings, {
        category: "missing_date",
        message: `${module.title} is missing a resume date.`,
        moduleId: module.id,
        moduleTitle: module.title,
        section: placement.section,
        blocksExport: true
      });
    }

    if (placement.section === "skills") {
      if (module.skills.filter(hasText).length === 0) {
        addWarning(warnings, {
          category: "missing_bullets",
          message: `${module.title} has no skills for the skills section.`,
          moduleId: module.id,
          moduleTitle: module.title,
          section: placement.section,
          blocksExport: true
        });
      }
    } else if (bullets.length === 0) {
      addWarning(warnings, {
        category: "missing_bullets",
        message: `${module.title} has no resume bullets.`,
        moduleId: module.id,
        moduleTitle: module.title,
        section: placement.section,
        blocksExport: true
      });
    }

    if (!module.proof || module.proof.filter(hasText).length === 0) {
      addWarning(warnings, {
        category: "missing_proof",
        message: `${module.title} has no proof attached.`,
        moduleId: module.id,
        moduleTitle: module.title,
        section: placement.section,
        blocksExport: false
      });
    }

    if (placement.section !== "education" && placement.section !== "skills" && !hasMetricLikeText(module)) {
      addWarning(warnings, {
        category: "missing_metrics",
        message: `${module.title} could use one metric before sending.`,
        moduleId: module.id,
        moduleTitle: module.title,
        section: placement.section,
        blocksExport: false
      });
    }
  }
}

function findPackMetric(
  metrics: CareerPackMetricToGather[],
  moduleId: string
): CareerPackMetricToGather | undefined {
  return metrics.find(
    (metric) => metric.moduleId === moduleId && metric.status !== "gathered"
  );
}

function addCareerPackWarnings(
  selected: ResumeModule[],
  input: ApplicationResumeReadinessInput,
  warnings: ResumeReadinessWarning[]
) {
  const pack = input.careerSourcePack;
  if (!pack) {
    return;
  }

  const selectedIds = new Set(selected.map((module) => module.id));
  const packModuleById = new Map(pack.resumeModules.map((module) => [module.id, module]));

  for (const module of selected) {
    const packModule = packModuleById.get(module.id);
    for (const caution of packModule?.claimsToAvoid ?? []) {
      addWarning(warnings, {
        category: "claims_caution",
        message: `${module.title}: ${caution}`,
        moduleId: module.id,
        moduleTitle: module.title,
        section: normalizeResumeModulePlacement(module, 0).section,
        blocksExport: false
      });
    }

    const metric = findPackMetric(pack.metricsToGather, module.id);
    if (metric) {
      addWarning(warnings, {
        category: "missing_metrics",
        message: `${module.title}: ${metric.metric}`,
        moduleId: module.id,
        moduleTitle: module.title,
        section: normalizeResumeModulePlacement(module, 0).section,
        blocksExport: false
      });
    }
  }

  for (const caution of pack.claimsSafety.globalClaimsToAvoid) {
    addWarning(warnings, {
      category: "claims_caution",
      message: caution,
      blocksExport: false
    });
  }

  const roleRecipes = pack.roleRecipes.filter((recipe) =>
    recipe.roleTypes.includes(input.card.careerApplication?.roleType ?? "")
  );
  if (
    roleRecipes.length > 0 &&
    !roleRecipes.some((recipe) =>
      [...recipe.preferredModuleIds, ...recipe.secondaryModuleIds].some((moduleId) =>
        selectedIds.has(moduleId)
      )
    )
  ) {
    addWarning(warnings, {
      category: "weak_role_fit",
      message: "Selected modules do not match the imported role recipe yet.",
      blocksExport: false
    });
  }

  const jobText = `${input.card.careerApplication?.jobDescription ?? ""} ${input.jobCandidate?.description ?? ""}`.toLowerCase();
  for (const weak of pack.matchingHints.weakFitWarnings) {
    if (weak.signal && jobText.includes(weak.signal.toLowerCase())) {
      addWarning(warnings, {
        category: "weak_role_fit",
        message: weak.reason,
        blocksExport: false
      });
    }
  }
}

function firstWarning(
  warnings: ResumeReadinessWarning[],
  category: ResumeReadinessWarningCategory
): ResumeReadinessWarning | undefined {
  return warnings.find((warning) => warning.category === category);
}

function nextTinyAction(
  packet: ResumeDraftPacket | undefined,
  selected: ResumeModule[],
  warnings: ResumeReadinessWarning[]
): string {
  if (!packet) {
    return "Create the resume draft packet for this application.";
  }
  if (packet.selectedModuleIds.length === 0 || selected.length === 0) {
    return "Select one active resume module for this application.";
  }

  const missingSection = firstWarning(warnings, "missing_section_coverage");
  if (missingSection?.section) {
    return `Select one ${RESUME_MODULE_SECTION_LABELS[missingSection.section]} module.`;
  }

  const missingDate = firstWarning(warnings, "missing_date");
  if (missingDate?.moduleTitle) {
    return `Add a date to the ${missingDate.moduleTitle} module.`;
  }

  const missingBullet = firstWarning(warnings, "missing_bullets");
  if (missingBullet?.moduleTitle) {
    return `Add one resume bullet to the ${missingBullet.moduleTitle} module.`;
  }

  const missingProof = firstWarning(warnings, "missing_proof");
  if (missingProof?.moduleTitle) {
    return `Attach one proof item to the ${missingProof.moduleTitle} module.`;
  }

  if (firstWarning(warnings, "claims_caution")) {
    return "Review the claims caution before exporting.";
  }

  const metric = firstWarning(warnings, "missing_metrics");
  if (metric?.moduleTitle) {
    return `Add one metric to the ${metric.moduleTitle} module.`;
  }

  return "Export DOCX and review manually.";
}

export function buildApplicationResumeReadiness(
  input: ApplicationResumeReadinessInput
): ApplicationResumeReadiness {
  const application = input.card.careerApplication;
  const packet = application?.resumeDraftPacket;
  const warnings: ResumeReadinessWarning[] = [];
  const selectedModulesBySection = emptySectionGroups();

  if (!application || !packet) {
    const reason = !application
      ? "Card is not a career application."
      : "Application card has no resume draft packet.";
    return {
      status: "blocked",
      selectedModulesBySection,
      warnings,
      exportReadiness: { canExportDocx: false, reason },
      nextTinyResumeAction: nextTinyAction(packet, [], warnings)
    };
  }

  if (packet.selectedModuleIds.length === 0) {
    return {
      status: "blocked",
      selectedModulesBySection,
      warnings,
      exportReadiness: { canExportDocx: false, reason: "No resume modules selected." },
      nextTinyResumeAction: nextTinyAction(packet, [], warnings)
    };
  }

  const selected = selectedModulesFromPacket(packet, input.resumeModules, warnings);
  const grouped = groupSelectedModules(selected);

  if (
    input.jobCandidate &&
    (input.jobCandidate.fitLabel === "bad_fit" ||
      input.jobCandidate.fitLabel === "stretch" ||
      application.roleType === "other")
  ) {
    addWarning(warnings, {
      category: "weak_role_fit",
      message:
        "This posting is a weak match for your tech-focused resume bank. Passing is fine — or tailor manually on the employer site.",
      blocksExport: false
    });
  }

  addSectionCoverageWarnings(grouped, warnings);
  addModuleContentWarnings(selected, warnings);
  addCareerPackWarnings(selected, input, warnings);

  if (selected.length === 0) {
    return {
      status: "blocked",
      selectedModulesBySection: grouped,
      warnings,
      exportReadiness: {
        canExportDocx: false,
        reason: "No selected resume modules are active and available."
      },
      nextTinyResumeAction: nextTinyAction(packet, selected, warnings)
    };
  }

  const blockingWarning = warnings.find((warning) => warning.blocksExport);
  const status: ApplicationResumeReadinessStatus =
    warnings.length === 0 ? "ready_to_export" : "needs_patch";

  return {
    status,
    selectedModulesBySection: grouped,
    warnings,
    exportReadiness: blockingWarning
      ? { canExportDocx: false, reason: blockingWarning.message }
      : { canExportDocx: true },
    nextTinyResumeAction: nextTinyAction(packet, selected, warnings)
  };
}
