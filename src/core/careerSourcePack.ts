import type {
  ResumeModule,
  ResumeModuleCategory,
  ResumeModulePlacement,
  ResumeModuleSection,
  RoleType
} from "./types";

const MAX_SCAN_DEPTH = 4;
const SNAKE_CASE_ID = /^[a-z][a-z0-9_]*$/;

const ROLE_TYPES: ReadonlySet<string> = new Set([
  "software",
  "cybersecurity",
  "it",
  "full_stack",
  "data_finance",
  "other"
]);

const RESUME_MODULE_CATEGORIES: ReadonlySet<string> = new Set([
  "project",
  "experience",
  "education",
  "skill_cluster",
  "certification"
]);

const RESUME_MODULE_SECTIONS: ReadonlySet<string> = new Set([
  "education",
  "skills",
  "projects",
  "additional_experience"
]);

const SECRET_PATTERNS: RegExp[] = [
  /SUPABASE_SERVICE_ROLE/i,
  /service_role/i,
  /\bapi_key\b/i,
  /DISCORD_WEBHOOK/i,
  /\.env\b/i,
  /\bsk-[a-zA-Z0-9]{10,}/,
  /\bghp_[a-zA-Z0-9]{20,}/,
  /\bAKIA[0-9A-Z]{16}/
];

const PII_KEY_PATTERN = /^(email|phone|address|street|zipcode|zip_code)$/i;
const EMAIL_PATTERN = /@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/;

export interface CareerPackCareerPositioning {
  headline: string;
  summary: string;
  currentPositioning: string[];
  bestDefaultProjectOrder: string[];
  defaultResumeFormula: string[];
  privacyNotes: string[];
}

export interface CareerPackResumeModule {
  id: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  skills: string[];
  bullets: string[];
  bestFor: string[];
  proof: string[];
  sourceFiles: string[];
  confidence: string;
  claimsToAvoid: string[];
  metricsToGather: string[];
  isActive: boolean;
  resumePlacement?: ResumeModulePlacement;
}

export interface CareerPackRoleRecipe {
  id: string;
  title: string;
  roleTypes: string[];
  summaryAngle: string;
  targetKeywords: string[];
  negativeKeywords: string[];
  preferredModuleIds: string[];
  secondaryModuleIds: string[];
  skillsToEmphasize: string[];
  bulletsToPrefer: string[];
  claimsToAvoid: string[];
  fitNotes: string[];
  sourceFiles: string[];
}

export interface CareerPackJobScoutFilters {
  roleRecipeFilters: string[];
  projectMatchFilters: string[];
  skillFilters: string[];
  locationPreferenceNotes: string[];
  seniorityPositiveSignals: string[];
  seniorityNegativeSignals: string[];
  clearanceSignals: string[];
  publicSectorSignals: string[];
  excludeOrCautionSignals: string[];
}

export interface CareerPackClaimsSafety {
  globalClaimsToAvoid: string[];
  safePhrasingRules: string[];
  unsupportedClaims: string[];
  needsEvidenceBeforeUsing: string[];
}

export interface CareerPackMetricToGather {
  moduleId: string;
  metric: string;
  whyItMatters: string;
  status: "missing" | "partial" | "gathered";
}

export interface CareerPackInterviewStory {
  id: string;
  title: string;
  themes: string[];
  modules: string[];
  situation: string;
  action: string;
  result: string;
  sourceFiles: string[];
}

export interface CareerPackMatchingHints {
  roleKeywordMap: Record<string, string[]>;
  moduleKeywordMap: Record<string, string[]>;
  strongFitCombinations: Array<{
    roleRecipeId: string;
    moduleIds: string[];
    reason: string;
  }>;
  weakFitWarnings: Array<{ signal: string; reason: string }>;
}

export interface CareerPackExtractionMetadata {
  schemaVersion: number;
  generatedAt: string;
  sourceRepo?: string;
  filesScanned?: string[];
  filesMissing?: string[];
  warnings: string[];
}

export interface CareerSourcePackV1 {
  careerPositioning: CareerPackCareerPositioning;
  resumeModules: CareerPackResumeModule[];
  roleRecipes: CareerPackRoleRecipe[];
  jobScoutFilters: CareerPackJobScoutFilters;
  claimsSafety: CareerPackClaimsSafety;
  metricsToGather: CareerPackMetricToGather[];
  interviewStories: CareerPackInterviewStory[];
  matchingHints: CareerPackMatchingHints;
  extractionMetadata: CareerPackExtractionMetadata;
}

export interface StoredCareerSourcePack {
  pack: CareerSourcePackV1;
  importedAt: string;
}

export type CareerPackImportResult =
  | { ok: true; pack: CareerSourcePackV1; warnings: string[] }
  | { ok: false; error: string; warnings?: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown, field: string): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }
  return value;
}

function scanForSecrets(value: unknown, depth = 0): string | undefined {
  if (depth > MAX_SCAN_DEPTH) {
    return undefined;
  }
  if (typeof value === "string") {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(value)) {
        return `Secret-like content detected (${pattern.source}).`;
      }
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = scanForSecrets(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(key)) {
          return `Secret-like key detected (${key}).`;
        }
      }
      const found = scanForSecrets(nested, depth + 1);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function collectPiiWarnings(value: unknown, depth = 0, warnings: string[] = []): string[] {
  if (depth > MAX_SCAN_DEPTH) {
    return warnings;
  }
  if (typeof value === "string") {
    if (EMAIL_PATTERN.test(value)) {
      warnings.push("Possible email address detected in pack content.");
    }
    if (PHONE_PATTERN.test(value)) {
      warnings.push("Possible phone number detected in pack content.");
    }
    return warnings;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPiiWarnings(item, depth + 1, warnings);
    }
    return warnings;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (PII_KEY_PATTERN.test(key)) {
        warnings.push(`PII-related key detected: ${key}.`);
      }
      collectPiiWarnings(nested, depth + 1, warnings);
    }
  }
  return warnings;
}

function requireString(value: unknown, field: string): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function validateSnakeId(id: unknown, label: string): string | undefined {
  if (typeof id !== "string" || !SNAKE_CASE_ID.test(id)) {
    return `${label} must be snake_case.`;
  }
  return undefined;
}

function parseResumeModule(raw: unknown, index: number): CareerPackResumeModule | string {
  if (!isRecord(raw)) {
    return `resumeModules[${index}] must be an object.`;
  }
  const id = requireString(raw.id, "id");
  if (!id) {
    return `resumeModules[${index}].id is required.`;
  }
  const idError = validateSnakeId(id, `resumeModules[${index}].id`);
  if (idError) {
    return idError;
  }
  const sourceFiles = asStringArray(raw.sourceFiles, "sourceFiles");
  if (!sourceFiles || sourceFiles.length === 0) {
    return `resumeModules[${index}].sourceFiles is required.`;
  }
  const title = requireString(raw.title, "title");
  const category = requireString(raw.category, "category");
  const summary = requireString(raw.summary, "summary");
  if (!title || !category || !summary) {
    return `resumeModules[${index}] missing title, category, or summary.`;
  }
  const resumePlacement = parseResumePlacement(raw.resumePlacement, index);
  if (typeof resumePlacement === "string") {
    return resumePlacement;
  }
  return {
    id,
    title,
    category,
    summary,
    tags: asStringArray(raw.tags, "tags") ?? [],
    skills: asStringArray(raw.skills, "skills") ?? [],
    bullets: asStringArray(raw.bullets, "bullets") ?? [],
    bestFor: asStringArray(raw.bestFor, "bestFor") ?? [],
    proof: asStringArray(raw.proof, "proof") ?? [],
    sourceFiles,
    confidence: typeof raw.confidence === "string" ? raw.confidence : "medium",
    claimsToAvoid: asStringArray(raw.claimsToAvoid, "claimsToAvoid") ?? [],
    metricsToGather: asStringArray(raw.metricsToGather, "metricsToGather") ?? [],
    isActive: raw.isActive !== false,
    resumePlacement
  };
}

function parseResumePlacement(raw: unknown, index: number): ResumeModulePlacement | undefined | string {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    return `resumeModules[${index}].resumePlacement must be an object.`;
  }
  const section = requireString(raw.section, "section");
  const heading = requireString(raw.heading, "heading");
  if (!section || !RESUME_MODULE_SECTIONS.has(section)) {
    return `resumeModules[${index}].resumePlacement.section is invalid.`;
  }
  if (!heading) {
    return `resumeModules[${index}].resumePlacement.heading is required.`;
  }
  const order = typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : undefined;
  if (order === undefined) {
    return `resumeModules[${index}].resumePlacement.order is required.`;
  }
  return {
    section: section as ResumeModuleSection,
    heading,
    detail: typeof raw.detail === "string" && raw.detail.trim() ? raw.detail : undefined,
    date: typeof raw.date === "string" && raw.date.trim() ? raw.date : undefined,
    order
  };
}

function parseRoleRecipe(raw: unknown, index: number): CareerPackRoleRecipe | string {
  if (!isRecord(raw)) {
    return `roleRecipes[${index}] must be an object.`;
  }
  const id = requireString(raw.id, "id");
  if (!id) {
    return `roleRecipes[${index}].id is required.`;
  }
  const idError = validateSnakeId(id, `roleRecipes[${index}].id`);
  if (idError) {
    return idError;
  }
  const preferredModuleIds = asStringArray(raw.preferredModuleIds, "preferredModuleIds");
  if (!preferredModuleIds) {
    return `roleRecipes[${index}].preferredModuleIds is required.`;
  }
  const title = requireString(raw.title, "title");
  const summaryAngle = requireString(raw.summaryAngle, "summaryAngle");
  if (!title || !summaryAngle) {
    return `roleRecipes[${index}] missing title or summaryAngle.`;
  }
  const sourceFiles = asStringArray(raw.sourceFiles, "sourceFiles") ?? [];
  return {
    id,
    title,
    roleTypes: asStringArray(raw.roleTypes, "roleTypes") ?? [],
    summaryAngle,
    targetKeywords: asStringArray(raw.targetKeywords, "targetKeywords") ?? [],
    negativeKeywords: asStringArray(raw.negativeKeywords, "negativeKeywords") ?? [],
    preferredModuleIds,
    secondaryModuleIds: asStringArray(raw.secondaryModuleIds, "secondaryModuleIds") ?? [],
    skillsToEmphasize: asStringArray(raw.skillsToEmphasize, "skillsToEmphasize") ?? [],
    bulletsToPrefer: asStringArray(raw.bulletsToPrefer, "bulletsToPrefer") ?? [],
    claimsToAvoid: asStringArray(raw.claimsToAvoid, "claimsToAvoid") ?? [],
    fitNotes: asStringArray(raw.fitNotes, "fitNotes") ?? [],
    sourceFiles
  };
}

function parseMetrics(raw: unknown): CareerPackMetricToGather[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: CareerPackMetricToGather[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const moduleId = requireString(item.moduleId, "moduleId");
    const metric = requireString(item.metric, "metric");
    const whyItMatters = requireString(item.whyItMatters, "whyItMatters");
    if (!moduleId || !metric || !whyItMatters) {
      continue;
    }
    const status =
      item.status === "partial" || item.status === "gathered" ? item.status : "missing";
    result.push({ moduleId, metric, whyItMatters, status });
  }
  return result;
}

function parseInterviewStories(raw: unknown): CareerPackInterviewStory[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: CareerPackInterviewStory[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const id = requireString(item.id, "id");
    const title = requireString(item.title, "title");
    const situation = requireString(item.situation, "situation");
    const action = requireString(item.action, "action");
    const resultText = requireString(item.result, "result");
    if (!id || !title || !situation || !action || !resultText) {
      continue;
    }
    result.push({
      id,
      title,
      themes: asStringArray(item.themes, "themes") ?? [],
      modules: asStringArray(item.modules, "modules") ?? [],
      situation,
      action,
      result: resultText,
      sourceFiles: asStringArray(item.sourceFiles, "sourceFiles") ?? []
    });
  }
  return result;
}

function parseMatchingHints(raw: unknown): CareerPackMatchingHints | string {
  if (!isRecord(raw)) {
    return "matchingHints must be an object.";
  }
  const roleKeywordMap: Record<string, string[]> = {};
  if (isRecord(raw.roleKeywordMap)) {
    for (const [key, value] of Object.entries(raw.roleKeywordMap)) {
      roleKeywordMap[key] = asStringArray(value, key) ?? [];
    }
  }
  const moduleKeywordMap: Record<string, string[]> = {};
  if (isRecord(raw.moduleKeywordMap)) {
    for (const [key, value] of Object.entries(raw.moduleKeywordMap)) {
      moduleKeywordMap[key] = asStringArray(value, key) ?? [];
    }
  }
  const strongFitCombinations: CareerPackMatchingHints["strongFitCombinations"] = [];
  if (Array.isArray(raw.strongFitCombinations)) {
    for (const item of raw.strongFitCombinations) {
      if (!isRecord(item)) {
        continue;
      }
      const roleRecipeId = requireString(item.roleRecipeId, "roleRecipeId");
      const moduleIds = asStringArray(item.moduleIds, "moduleIds");
      const reason = requireString(item.reason, "reason");
      if (roleRecipeId && moduleIds && reason) {
        strongFitCombinations.push({ roleRecipeId, moduleIds, reason });
      }
    }
  }
  const weakFitWarnings: CareerPackMatchingHints["weakFitWarnings"] = [];
  if (Array.isArray(raw.weakFitWarnings)) {
    for (const item of raw.weakFitWarnings) {
      if (!isRecord(item)) {
        continue;
      }
      const signal = requireString(item.signal, "signal");
      const reason = requireString(item.reason, "reason");
      if (signal && reason) {
        weakFitWarnings.push({ signal, reason });
      }
    }
  }
  return { roleKeywordMap, moduleKeywordMap, strongFitCombinations, weakFitWarnings };
}

function parseJobScoutFilters(raw: unknown): CareerPackJobScoutFilters | string {
  if (!isRecord(raw)) {
    return "jobScoutFilters must be an object.";
  }
  return {
    roleRecipeFilters: asStringArray(raw.roleRecipeFilters, "roleRecipeFilters") ?? [],
    projectMatchFilters: asStringArray(raw.projectMatchFilters, "projectMatchFilters") ?? [],
    skillFilters: asStringArray(raw.skillFilters, "skillFilters") ?? [],
    locationPreferenceNotes: asStringArray(raw.locationPreferenceNotes, "locationPreferenceNotes") ?? [],
    seniorityPositiveSignals: asStringArray(raw.seniorityPositiveSignals, "seniorityPositiveSignals") ?? [],
    seniorityNegativeSignals: asStringArray(raw.seniorityNegativeSignals, "seniorityNegativeSignals") ?? [],
    clearanceSignals: asStringArray(raw.clearanceSignals, "clearanceSignals") ?? [],
    publicSectorSignals: asStringArray(raw.publicSectorSignals, "publicSectorSignals") ?? [],
    excludeOrCautionSignals: asStringArray(raw.excludeOrCautionSignals, "excludeOrCautionSignals") ?? []
  };
}

function parseClaimsSafety(raw: unknown): CareerPackClaimsSafety | string {
  if (!isRecord(raw)) {
    return "claimsSafety must be an object.";
  }
  return {
    globalClaimsToAvoid: asStringArray(raw.globalClaimsToAvoid, "globalClaimsToAvoid") ?? [],
    safePhrasingRules: asStringArray(raw.safePhrasingRules, "safePhrasingRules") ?? [],
    unsupportedClaims: asStringArray(raw.unsupportedClaims, "unsupportedClaims") ?? [],
    needsEvidenceBeforeUsing: asStringArray(raw.needsEvidenceBeforeUsing, "needsEvidenceBeforeUsing") ?? []
  };
}

function parseCareerPositioning(raw: unknown): CareerPackCareerPositioning | string {
  if (!isRecord(raw)) {
    return "careerPositioning must be an object.";
  }
  const headline = requireString(raw.headline, "headline");
  const summary = requireString(raw.summary, "summary");
  if (!headline || !summary) {
    return "careerPositioning requires headline and summary.";
  }
  return {
    headline,
    summary,
    currentPositioning: asStringArray(raw.currentPositioning, "currentPositioning") ?? [],
    bestDefaultProjectOrder: asStringArray(raw.bestDefaultProjectOrder, "bestDefaultProjectOrder") ?? [],
    defaultResumeFormula: asStringArray(raw.defaultResumeFormula, "defaultResumeFormula") ?? [],
    privacyNotes: asStringArray(raw.privacyNotes, "privacyNotes") ?? []
  };
}

function coerceRoleType(value: string): RoleType {
  return ROLE_TYPES.has(value) ? (value as RoleType) : "other";
}

function coerceCategory(value: string): ResumeModuleCategory {
  return RESUME_MODULE_CATEGORIES.has(value)
    ? (value as ResumeModuleCategory)
    : "project";
}

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

function inferPackModulePlacement(module: CareerPackResumeModule): ResumeModulePlacement {
  const category = coerceCategory(module.category);
  const section =
    module.resumePlacement?.section &&
    RESUME_MODULE_SECTIONS.has(module.resumePlacement.section)
      ? module.resumePlacement.section
      : defaultSectionForCategory(category);
  const needsDate = section !== "skills";

  return {
    section,
    heading: module.resumePlacement?.heading?.trim() || module.title,
    detail: module.resumePlacement?.detail?.trim() || module.summary.trim() || undefined,
    date: needsDate
      ? module.resumePlacement?.date?.trim() || "2024-2026"
      : undefined,
    order: Number.isFinite(module.resumePlacement?.order) ? module.resumePlacement!.order : 10
  };
}

export function mapPackModuleToResumeModule(module: CareerPackResumeModule): ResumeModule {
  const tagBestFor = module.tags
    .filter((tag) => ROLE_TYPES.has(tag))
    .map((tag) => coerceRoleType(tag));
  const bestFor =
    tagBestFor.length > 0
      ? [...new Set(tagBestFor)]
      : module.bestFor.map(coerceRoleType).filter((role) => role !== "other");

  return {
    id: module.id,
    title: module.title,
    category: coerceCategory(module.category),
    summary: module.summary,
    tags: module.tags,
    bullets: module.bullets,
    skills: module.skills,
    bestFor: bestFor.length > 0 ? bestFor : ["software"],
    proof: module.proof.length > 0 ? module.proof : undefined,
    isActive: module.isActive,
    importedFromCareerPack: true,
    resumePlacement: inferPackModulePlacement(module)
  };
}

export function upsertPackResumeModules(
  existing: ResumeModule[],
  packModules: CareerPackResumeModule[]
): ResumeModule[] {
  const mapped = packModules.map(mapPackModuleToResumeModule);
  const byId = new Map(existing.map((module) => [module.id, module]));
  for (const module of mapped) {
    byId.set(module.id, module);
  }
  return [...byId.values()];
}

export function parseCareerSourcePackJson(json: string): CareerPackImportResult {
  const trimmed = json.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste is empty." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }

  const secretHit = scanForSecrets(parsed);
  if (secretHit) {
    return { ok: false, error: secretHit };
  }

  const warnings = [...new Set(collectPiiWarnings(parsed))];

  if (!isRecord(parsed)) {
    return { ok: false, error: "Pack must be a JSON object.", warnings };
  }

  const metadataRaw = parsed.extractionMetadata;
  if (!isRecord(metadataRaw)) {
    return { ok: false, error: "extractionMetadata is required.", warnings };
  }
  if (metadataRaw.schemaVersion !== 1) {
    return {
      ok: false,
      error: `Unsupported schema version: ${String(metadataRaw.schemaVersion)}. Expected 1.`,
      warnings
    };
  }
  const generatedAt = requireString(metadataRaw.generatedAt, "generatedAt");
  if (!generatedAt) {
    return { ok: false, error: "extractionMetadata.generatedAt is required.", warnings };
  }
  const metadataWarnings = asStringArray(metadataRaw.warnings, "warnings") ?? [];

  const careerPositioning = parseCareerPositioning(parsed.careerPositioning);
  if (typeof careerPositioning === "string") {
    return { ok: false, error: careerPositioning, warnings };
  }

  if (!Array.isArray(parsed.resumeModules) || parsed.resumeModules.length === 0) {
    return { ok: false, error: "resumeModules must be a non-empty array.", warnings };
  }
  const resumeModules: CareerPackResumeModule[] = [];
  for (let i = 0; i < parsed.resumeModules.length; i++) {
    const module = parseResumeModule(parsed.resumeModules[i], i);
    if (typeof module === "string") {
      return { ok: false, error: module, warnings };
    }
    resumeModules.push(module);
  }

  if (!Array.isArray(parsed.roleRecipes) || parsed.roleRecipes.length === 0) {
    return { ok: false, error: "roleRecipes must be a non-empty array.", warnings };
  }
  const roleRecipes: CareerPackRoleRecipe[] = [];
  for (let i = 0; i < parsed.roleRecipes.length; i++) {
    const recipe = parseRoleRecipe(parsed.roleRecipes[i], i);
    if (typeof recipe === "string") {
      return { ok: false, error: recipe, warnings };
    }
    roleRecipes.push(recipe);
  }

  const jobScoutFilters = parseJobScoutFilters(parsed.jobScoutFilters);
  if (typeof jobScoutFilters === "string") {
    return { ok: false, error: jobScoutFilters, warnings };
  }

  const claimsSafety = parseClaimsSafety(parsed.claimsSafety);
  if (typeof claimsSafety === "string") {
    return { ok: false, error: claimsSafety, warnings };
  }

  const matchingHints = parseMatchingHints(parsed.matchingHints);
  if (typeof matchingHints === "string") {
    return { ok: false, error: matchingHints, warnings };
  }

  const metricsToGather = parseMetrics(parsed.metricsToGather);
  const interviewStories = parseInterviewStories(parsed.interviewStories);

  const pack: CareerSourcePackV1 = {
    careerPositioning,
    resumeModules,
    roleRecipes,
    jobScoutFilters,
    claimsSafety,
    metricsToGather,
    interviewStories,
    matchingHints,
    extractionMetadata: {
      schemaVersion: 1,
      generatedAt,
      sourceRepo: typeof metadataRaw.sourceRepo === "string" ? metadataRaw.sourceRepo : undefined,
      filesScanned: asStringArray(metadataRaw.filesScanned, "filesScanned"),
      filesMissing: asStringArray(metadataRaw.filesMissing, "filesMissing"),
      warnings: metadataWarnings
    }
  };

  return {
    ok: true,
    pack,
    warnings: [...new Set([...warnings, ...metadataWarnings])]
  };
}
