import type { LifeHarnessData } from "./lifeHarnessData";
import { normalizeResumeDate } from "./resumeDateFormat";
import type { ResumeDocxDraft, ResumeEntry, ResumeProfile } from "./resumeDocx";
import { validateResumeDocxDraft } from "./resumeDocx";
import {
  normalizeResumeModulePlacement,
  normalizeResumeModules
} from "./resumeModuleBank";
import type { LifeCard, ResumeModule } from "./types";

export type ApplicationResumeExportResult =
  | { ok: true; draft: ResumeDocxDraft; fileName: string }
  | { ok: false; errors: string[] };

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function hasText(value: string | undefined): boolean {
  return clean(value).length > 0;
}

function sanitizeFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function activeModuleMap(modules: ResumeModule[]): Map<string, ResumeModule> {
  return new Map(normalizeResumeModules(modules).filter((module) => module.isActive).map((module) => [module.id, module]));
}

function moduleSort(a: ResumeModule, b: ResumeModule): number {
  const aPlacement = normalizeResumeModulePlacement(a, 0);
  const bPlacement = normalizeResumeModulePlacement(b, 0);
  if (aPlacement.order !== bPlacement.order) {
    return aPlacement.order - bPlacement.order;
  }
  return aPlacement.heading.localeCompare(bPlacement.heading);
}

function validateProfile(profile: ResumeProfile): string[] {
  const errors: string[] = [];
  if (!hasText(profile.name)) {
    errors.push("Profile name is required.");
  }
  if (!profile.contactItems?.some(hasText)) {
    errors.push("Profile contact items are required.");
  }
  return errors;
}

function mapProjectLike(module: ResumeModule, errors: string[]): ResumeEntry | undefined {
  const placement = normalizeResumeModulePlacement(module, 0);
  const bullets = module.bullets.filter(hasText);
  if (!hasText(placement.date)) {
    errors.push(`${module.title} is missing a resume date.`);
  }
  if (bullets.length === 0) {
    errors.push(`${module.title} has no resume bullets.`);
  }
  if (!hasText(placement.date) || bullets.length === 0) {
    return undefined;
  }
  return {
    title: placement.heading,
    meta: placement.detail,
    date: normalizeResumeDate(placement.date!),
    bullets
  };
}

export function buildApplicationResumeDocxDraft(
  card: LifeCard,
  resumeModules: ResumeModule[],
  profile: ResumeProfile
): ApplicationResumeExportResult {
  const errors = validateProfile(profile);
  const application = card.careerApplication;
  const packet = application?.resumeDraftPacket;

  if (!application) {
    errors.push("Card is not a career application.");
  }
  if (!packet) {
    errors.push("Application card has no resume draft packet.");
  }
  if (!packet || !application) {
    return { ok: false, errors };
  }

  const modulesById = activeModuleMap(resumeModules);
  const selected: ResumeModule[] = [];
  for (const moduleId of packet.selectedModuleIds) {
    const module = modulesById.get(moduleId);
    if (!module) {
      errors.push(`Missing resume module: ${moduleId}.`);
    } else {
      selected.push(module);
    }
  }

  const education = selected
    .filter((module) => normalizeResumeModulePlacement(module, 0).section === "education")
    .sort(moduleSort)
    .map((module) => {
      const placement = normalizeResumeModulePlacement(module, 0);
      if (!hasText(placement.date)) {
        errors.push(`${module.title} is missing a resume date.`);
      }
      return {
        degree: placement.detail ?? module.summary,
        date: normalizeResumeDate(placement.date ?? ""),
        school: placement.heading,
        details: module.bullets.filter(hasText)
      };
    });

  const skills = selected
    .filter((module) => normalizeResumeModulePlacement(module, 0).section === "skills")
    .sort(moduleSort)
    .map((module) => {
      const placement = normalizeResumeModulePlacement(module, 0);
      if (module.skills.filter(hasText).length === 0) {
        errors.push(`${module.title} has no skills for the skills section.`);
      }
      return {
        label: placement.heading,
        skills: module.skills.filter(hasText).join(", ")
      };
    });

  const projects = selected
    .filter((module) => normalizeResumeModulePlacement(module, 0).section === "projects")
    .sort(moduleSort)
    .map((module) => mapProjectLike(module, errors))
    .filter((entry): entry is ResumeEntry => Boolean(entry));

  const additionalExperience = selected
    .filter((module) => normalizeResumeModulePlacement(module, 0).section === "additional_experience")
    .sort(moduleSort)
    .map((module) => mapProjectLike(module, errors))
    .filter((entry): entry is ResumeEntry => Boolean(entry));

  if (education.length === 0) {
    errors.push("Education section requires at least one selected module.");
  }
  if (skills.length === 0) {
    errors.push("Skills section requires at least one selected module.");
  }
  if (projects.length === 0) {
    errors.push("Projects section requires at least one selected module.");
  }

  const draft: ResumeDocxDraft = {
    profile: {
      name: clean(profile.name),
      contactItems: profile.contactItems.map(clean).filter(Boolean)
    },
    summary: packet.resumeAngle,
    education,
    skills,
    projects,
    additionalExperience
  };

  try {
    validateResumeDocxDraft(draft);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Resume draft validation failed.");
  }

  if (errors.length > 0) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  const company = sanitizeFilePart(application.company) || "company";
  const role = sanitizeFilePart(application.roleTitle) || "role";
  return { ok: true, draft, fileName: `${company}-${role}-resume.docx` };
}

export function buildApplicationResumeDocxDraftFromState(
  state: LifeHarnessData,
  cardId: string,
  profile: ResumeProfile
): ApplicationResumeExportResult {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card) {
    return { ok: false, errors: [`Application card not found: ${cardId}.`] };
  }
  return buildApplicationResumeDocxDraft(card, state.resumeModules, profile);
}
