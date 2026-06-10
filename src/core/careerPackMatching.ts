import {
  detectEntryLevelSignals,
  detectSeniorityMismatch
} from "./jobScout";
import type { CareerSourcePackV1 } from "./careerSourcePack";
import type { JobCandidate, JobSource, ResumeModule } from "./types";

export type CareerFitTier = "strong" | "mixed" | "weak";

export interface CareerMatchSignal {
  kind: "positive" | "caution";
  label: string;
  detail?: string;
}

export interface CareerEvidenceGap {
  moduleId: string;
  metric: string;
  whyItMatters: string;
  status: "missing" | "partial";
}

export interface CareerCandidateMatch {
  fitTier: CareerFitTier;
  roleRecipeId: string | null;
  roleRecipeTitle: string | null;
  matchedModuleIds: string[];
  positiveSignals: CareerMatchSignal[];
  cautionSignals: CareerMatchSignal[];
  claimsWarnings: string[];
  evidenceGaps: CareerEvidenceGap[];
  suggestedSummaryAngle: string | null;
  suggestedModuleOrder: string[];
  suggestedBullets: string[];
  relatedStoryTitles: string[];
}

const DEFAULT_ROLE_RECIPE_ID = "general_swe";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textIncludes(text: string, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes(" ")) {
    return text.includes(normalized);
  }
  return new RegExp(`\\b${escapeRegex(normalized)}\\b`, "i").test(text);
}

export function buildCandidateSearchText(
  candidate: Pick<JobCandidate, "roleTitle" | "description" | "location" | "company">,
  sourceName?: string
): string {
  const parts = [
    candidate.roleTitle,
    candidate.company,
    candidate.location ?? "",
    candidate.description,
    sourceName ?? ""
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function scoreRoleRecipe(
  recipeId: string,
  recipe: CareerSourcePackV1["roleRecipes"][number],
  text: string,
  hints: CareerSourcePackV1["matchingHints"]
): number {
  let score = 0;
  const extraKeywords = hints.roleKeywordMap[recipeId] ?? [];
  for (const keyword of [...recipe.targetKeywords, ...extraKeywords]) {
    if (textIncludes(text, keyword)) {
      score += 3;
    }
  }
  for (const keyword of recipe.negativeKeywords) {
    if (textIncludes(text, keyword)) {
      score -= 4;
    }
  }
  return score;
}

function scoreModules(
  text: string,
  pack: CareerSourcePackV1,
  modules: ResumeModule[]
): string[] {
  const activeIds = new Set(modules.filter((m) => m.isActive).map((m) => m.id));
  const hits: Array<{ id: string; score: number }> = [];

  for (const packModule of pack.resumeModules) {
    if (!activeIds.has(packModule.id)) {
      continue;
    }
    let score = 0;
    const keywords = pack.matchingHints.moduleKeywordMap[packModule.id] ?? [];
    for (const keyword of [...keywords, ...packModule.skills]) {
      if (textIncludes(text, keyword)) {
        score += 2;
      }
    }
    if (score > 0) {
      hits.push({ id: packModule.id, score });
    }
  }

  return hits.sort((a, b) => b.score - a.score).map((hit) => hit.id);
}

function findCautionSignals(
  text: string,
  pack: CareerSourcePackV1
): CareerMatchSignal[] {
  const signals: CareerMatchSignal[] = [];
  const filters = pack.jobScoutFilters;

  for (const signal of filters.excludeOrCautionSignals) {
    if (textIncludes(text, signal)) {
      const hint = pack.matchingHints.weakFitWarnings.find((item) =>
        textIncludes(signal, item.signal)
      );
      signals.push({
        kind: "caution",
        label: signal,
        detail: hint?.reason
      });
    }
  }

  for (const signal of filters.seniorityNegativeSignals) {
    if (textIncludes(text, signal)) {
      signals.push({ kind: "caution", label: signal, detail: "Seniority mismatch." });
    }
  }

  const seniority = detectSeniorityMismatch("", text);
  if (seniority.hardDisqualifier && seniority.gap) {
    signals.push({ kind: "caution", label: "seniority mismatch", detail: seniority.gap });
  }

  if (textIncludes(text, "no new grads") || textIncludes(text, "no new graduates")) {
    signals.push({
      kind: "caution",
      label: "no new grads",
      detail: "Direct conflict with new-grad positioning."
    });
  }

  const activeClearanceRequired =
    textIncludes(text, "active clearance required") ||
    textIncludes(text, "ts/sci required") ||
    textIncludes(text, "must already hold secret") ||
    (textIncludes(text, "active") && textIncludes(text, "ts/sci"));

  if (activeClearanceRequired) {
    signals.push({
      kind: "caution",
      label: "active clearance required",
      detail: "Eligible only; active clearance not documented."
    });
  }

  return signals;
}

function findPositiveSignals(
  text: string,
  pack: CareerSourcePackV1
): CareerMatchSignal[] {
  const signals: CareerMatchSignal[] = [];
  const filters = pack.jobScoutFilters;

  for (const signal of filters.seniorityPositiveSignals) {
    if (textIncludes(text, signal)) {
      signals.push({ kind: "positive", label: signal });
    }
  }

  const entry = detectEntryLevelSignals(text);
  if (entry.reason) {
    signals.push({ kind: "positive", label: "entry-level", detail: entry.reason });
  }

  for (const signal of filters.clearanceSignals) {
    if (textIncludes(text, signal)) {
      signals.push({ kind: "positive", label: signal });
    }
  }

  if (textIncludes(text, "able to obtain") && textIncludes(text, "clearance")) {
    signals.push({
      kind: "positive",
      label: "clearance eligible",
      detail: "Able to obtain clearance language detected."
    });
  }

  for (const signal of filters.publicSectorSignals) {
    if (textIncludes(text, signal)) {
      signals.push({ kind: "positive", label: signal });
    }
  }

  return signals;
}

function findClaimsWarnings(
  text: string,
  pack: CareerSourcePackV1,
  matchedModuleIds: string[]
): string[] {
  const warnings: string[] = [];
  const lower = text.toLowerCase();

  for (const claim of pack.claimsSafety.globalClaimsToAvoid) {
    if (lower.includes(claim.toLowerCase())) {
      warnings.push(claim);
    }
  }

  for (const moduleId of matchedModuleIds) {
    const packModule = pack.resumeModules.find((m) => m.id === moduleId);
    if (!packModule) {
      continue;
    }
    for (const claim of packModule.claimsToAvoid) {
      if (lower.includes(claim.toLowerCase().slice(0, 20))) {
        warnings.push(`${moduleId}: ${claim}`);
      }
    }
  }

  return [...new Set(warnings)];
}

function buildEvidenceGaps(
  pack: CareerSourcePackV1,
  matchedModuleIds: string[],
  modules: ResumeModule[]
): CareerEvidenceGap[] {
  const gaps: CareerEvidenceGap[] = [];
  for (const metric of pack.metricsToGather) {
    if (!matchedModuleIds.includes(metric.moduleId)) {
      continue;
    }
    if (metric.status === "gathered") {
      continue;
    }
    const module = modules.find((m) => m.id === metric.moduleId);
    const hasProof = (module?.proof?.length ?? 0) > 0;
    gaps.push({
      moduleId: metric.moduleId,
      metric: metric.metric,
      whyItMatters: metric.whyItMatters,
      status: hasProof && metric.status === "partial" ? "partial" : metric.status === "partial" ? "partial" : "missing"
    });
  }
  return gaps;
}

function buildSuggestedBullets(
  recipe: CareerSourcePackV1["roleRecipes"][number] | undefined,
  matchedModuleIds: string[],
  modules: ResumeModule[]
): string[] {
  if (!recipe) {
    return [];
  }
  const preferSet = new Set(recipe.bulletsToPrefer);
  const bullets: string[] = [];
  for (const moduleId of matchedModuleIds) {
    const module = modules.find((m) => m.id === moduleId);
    if (!module) {
      continue;
    }
    for (const bullet of module.bullets) {
      if (preferSet.has(bullet)) {
        bullets.push(bullet);
      }
    }
  }
  return bullets.slice(0, 4);
}

function resolveTier(
  roleScore: number,
  matchedModuleIds: string[],
  cautionSignals: CareerMatchSignal[],
  text: string
): CareerFitTier {
  const severeCaution =
    cautionSignals.some((s) =>
      ["principal engineer", "staff engineer", "10+ years", "no new grads", "seniority mismatch"].some(
        (term) => textIncludes(s.label, term) || textIncludes(s.label, "senior")
      )
    ) || detectSeniorityMismatch("", text).hardDisqualifier;

  if (severeCaution || (roleScore <= 0 && matchedModuleIds.length === 0)) {
    return "weak";
  }

  const goodRole = roleScore >= 3;
  const goodModules = matchedModuleIds.length > 0;
  const mildCaution = cautionSignals.length > 0;

  if (goodRole && goodModules && !mildCaution) {
    return "strong";
  }
  if (goodRole && goodModules) {
    return "mixed";
  }
  if (goodRole || goodModules) {
    return "mixed";
  }
  return "weak";
}

export function createNeutralCareerMatch(): CareerCandidateMatch {
  return {
    fitTier: "mixed",
    roleRecipeId: null,
    roleRecipeTitle: null,
    matchedModuleIds: [],
    positiveSignals: [],
    cautionSignals: [],
    claimsWarnings: [],
    evidenceGaps: [],
    suggestedSummaryAngle: null,
    suggestedModuleOrder: [],
    suggestedBullets: [],
    relatedStoryTitles: []
  };
}

export function matchCandidateWithCareerPack(
  candidate: JobCandidate,
  pack: CareerSourcePackV1,
  modules: ResumeModule[],
  sourceName?: string
): CareerCandidateMatch {
  const text = buildCandidateSearchText(candidate, sourceName);

  const roleScores = pack.roleRecipes.map((recipe) => ({
    recipe,
    score: scoreRoleRecipe(recipe.id, recipe, text, pack.matchingHints)
  }));
  roleScores.sort((a, b) => b.score - a.score);

  let best = roleScores[0];
  if (!best || best.score <= 0) {
    const fallback = pack.roleRecipes.find((r) => r.id === DEFAULT_ROLE_RECIPE_ID);
    best = fallback
      ? { recipe: fallback, score: 0 }
      : { recipe: pack.roleRecipes[0], score: 0 };
  }

  const recipe = best.recipe;
  const preferredHits = scoreModules(text, pack, modules);
  const recipeModuleOrder = [
    ...recipe.preferredModuleIds.filter((id) => preferredHits.includes(id)),
    ...recipe.secondaryModuleIds.filter((id) => preferredHits.includes(id)),
    ...preferredHits.filter(
      (id) => !recipe.preferredModuleIds.includes(id) && !recipe.secondaryModuleIds.includes(id)
    )
  ];

  const positiveSignals = findPositiveSignals(text, pack);
  const cautionSignals = findCautionSignals(text, pack);
  const claimsWarnings = findClaimsWarnings(text, pack, recipeModuleOrder);
  const evidenceGaps = buildEvidenceGaps(pack, recipeModuleOrder, modules);
  const suggestedBullets = buildSuggestedBullets(recipe, recipeModuleOrder, modules);

  const moduleTitles = recipeModuleOrder
    .map((id) => modules.find((m) => m.id === id)?.title ?? pack.resumeModules.find((m) => m.id === id)?.title)
    .filter((title): title is string => Boolean(title));

  const relatedStoryTitles = pack.interviewStories
    .filter((story) => story.modules.some((id) => recipeModuleOrder.includes(id)))
    .map((story) => story.title)
    .slice(0, 3);

  const fitTier = resolveTier(best.score, recipeModuleOrder, cautionSignals, text);

  return {
    fitTier,
    roleRecipeId: recipe.id,
    roleRecipeTitle: recipe.title,
    matchedModuleIds: recipeModuleOrder,
    positiveSignals,
    cautionSignals,
    claimsWarnings,
    evidenceGaps,
    suggestedSummaryAngle: recipe.summaryAngle,
    suggestedModuleOrder: moduleTitles,
    suggestedBullets,
    relatedStoryTitles
  };
}

export function matchCandidatesWithCareerPack(
  candidates: JobCandidate[],
  pack: CareerSourcePackV1,
  modules: ResumeModule[],
  sources: JobSource[]
): Map<string, CareerCandidateMatch> {
  const sourceById = new Map(sources.map((s) => [s.id, s.name]));
  const result = new Map<string, CareerCandidateMatch>();
  for (const candidate of candidates) {
    const sourceName = candidate.sourceId ? sourceById.get(candidate.sourceId) : undefined;
    result.set(candidate.id, matchCandidateWithCareerPack(candidate, pack, modules, sourceName));
  }
  return result;
}

export function buildCareerPackBriefingStats(
  candidates: JobCandidate[],
  pack: CareerSourcePackV1 | null,
  modules: ResumeModule[],
  sources: JobSource[]
): { strongCount: number; evidenceGapCount: number; imported: boolean } {
  if (!pack) {
    return { strongCount: 0, evidenceGapCount: 0, imported: false };
  }
  const waiting = candidates.filter(
    (c) => c.status === "new" || c.status === "saved"
  );
  const matches = matchCandidatesWithCareerPack(waiting, pack, modules, sources);
  let strongCount = 0;
  let evidenceGapCount = 0;
  for (const match of matches.values()) {
    if (match.fitTier === "strong") {
      strongCount += 1;
    }
    evidenceGapCount += match.evidenceGaps.length;
  }
  return { strongCount, evidenceGapCount, imported: true };
}
