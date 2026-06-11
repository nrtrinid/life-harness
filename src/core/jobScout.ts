import { type CareerIntakeInput } from "./career";
import { createId, nowIso } from "./ids";
import type {
  JobCandidate,
  JobCandidateOrigin,
  JobCandidateStatus,
  JobFitLabel,
  JobSource,
  JobSourceRunResult,
  LifeCard,
  LifeLogEntry,
  ResumeModule,
  RoleType
} from "./types";

/** @deprecated Legacy 3-tier alias — maps from 4-tier fit labels */
export type FitTier = "strong" | "mixed" | "weak";

export const FIT_LABEL_THRESHOLDS = {
  strong: 80,
  possible: 60,
  stretch: 40
} as const;

/** Strong-fit cutoff for briefing signals and legacy tier helpers */
export const FIT_TIER_THRESHOLDS = {
  strong: FIT_LABEL_THRESHOLDS.strong,
  mixed: FIT_LABEL_THRESHOLDS.stretch
} as const;

export interface FitFinderResult {
  ok: boolean;
  runnerUnreachable: boolean;
  createdCandidateIds: string[];
  skippedDuplicates: number;
  strongCount: number;
  possibleCount: number;
  stretchCount: number;
  badFitCount: number;
  errors: string[];
  message: string;
}

export interface JobCandidateIntakeInput {
  company: string;
  roleTitle: string;
  sourceUrl?: string;
  location?: string;
  description: string;
  roleType: RoleType;
  sourceId?: string;
  origin?: JobCandidateOrigin;
}

export interface JobScoutStats {
  activeResumeModules: number;
  candidatesSaved: number;
  candidatesApproved: number;
  candidatesDismissed: number;
  averageFitScore: number;
  jobSourcesConfigured: number;
  enabledSources: number;
  sourcesRun: number;
  candidatesFetched: number;
  candidatesApprovedFromFetch: number;
  skippedDuplicatesTotal: number;
  lastSourceRunAt?: string;
  manualCandidates: number;
}

export interface CandidateBriefingSignals {
  savedWaiting: number;
  strongFitCandidates: JobCandidate[];
  fetchedWaiting: number;
  strongFitFetchedCandidates: JobCandidate[];
  sourcesConfigured: number;
  enabledSources: number;
  lastSuccessfulSourceRun?: { sourceName: string; fetchedCount: number };
}

const DESCRIPTION_KEYWORDS = [
  "python",
  "typescript",
  "javascript",
  "react",
  "fastapi",
  "postgres",
  "security",
  "cybersecurity",
  "api",
  "full stack",
  "data",
  "finance",
  "kubernetes",
  "aws",
  "testing"
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWordMatch(text: string, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return new RegExp(`\\b${escapeRegex(normalized)}\\b`, "i").test(text);
}

function getSearchText(candidate: Pick<JobCandidate, "roleTitle" | "description">): string {
  return `${candidate.roleTitle} ${candidate.description}`.toLowerCase();
}

const SENIORITY_TITLE_TERMS = ["senior", "staff", "principal", "lead", "manager"];
const YEARS_REQUIREMENT_PATTERN = /\b(?:5|7|10)\+\s*years?\b/i;
const ENTRY_LEVEL_TERMS = [
  "entry level",
  "entry-level",
  "new grad",
  "new-grad",
  "new graduate",
  "associate",
  "junior",
  "early career"
];
const DESCRIPTION_SENIORITY_TERMS = ["senior", "staff", "principal"];

export type ScoreJobCandidateInput = Pick<JobCandidate, "roleTitle" | "description" | "roleType"> & {
  company?: string;
  location?: string;
  sourceName?: string;
};

export function extractMatchedSkills(text: string, modules: ResumeModule[]): string[] {
  const activeModules = modules.filter((module) => module.isActive);
  const matched = new Set<string>();
  for (const module of activeModules) {
    for (const skill of module.skills) {
      if (hasWordMatch(text, skill)) {
        matched.add(skill);
      }
    }
  }
  return [...matched];
}

export function detectSeniorityMismatch(
  roleTitle: string,
  description: string
): { hardDisqualifier: boolean; penalty: number; gap?: string } {
  const titleLower = roleTitle.toLowerCase();
  const fullText = `${roleTitle} ${description}`.toLowerCase();

  if (SENIORITY_TITLE_TERMS.some((term) => hasWordMatch(titleLower, term))) {
    return {
      hardDisqualifier: true,
      penalty: 0,
      gap: "Title signals senior-level role — likely above current target."
    };
  }

  if (YEARS_REQUIREMENT_PATTERN.test(fullText)) {
    return {
      hardDisqualifier: true,
      penalty: 0,
      gap: "Posting requires 5+ years experience — likely above current target."
    };
  }

  const descriptionOnlySenior = DESCRIPTION_SENIORITY_TERMS.some(
    (term) => hasWordMatch(description.toLowerCase(), term) && !hasWordMatch(titleLower, term)
  );
  if (descriptionOnlySenior) {
    return {
      hardDisqualifier: false,
      penalty: 12,
      gap: "Description mentions senior-level context — confirm this is not a senior-only role."
    };
  }

  return { hardDisqualifier: false, penalty: 0 };
}

export function detectEntryLevelSignals(text: string): { boost: number; reason?: string } {
  for (const term of ENTRY_LEVEL_TERMS) {
    if (text.includes(term)) {
      return { boost: 10, reason: "Matches entry-level / new-grad role language." };
    }
  }
  return { boost: 0 };
}

export function detectSecuritySignals(
  text: string,
  modules: ResumeModule[]
): { boost: number; reason?: string } {
  const securityInJob =
    hasWordMatch(text, "security") ||
    hasWordMatch(text, "cybersecurity") ||
    hasWordMatch(text, "cyber");
  if (!securityInJob) {
    return { boost: 0 };
  }
  const hasSecurityModule = modules.some(
    (module) =>
      module.isActive &&
      (module.bestFor.includes("cybersecurity") ||
        module.tags.some((tag) => /security|cyber/i.test(tag)) ||
        module.skills.some((skill) => /security|cyber/i.test(skill)))
  );
  if (hasSecurityModule) {
    return { boost: 8, reason: "Security/cybersecurity language aligns with resume bank." };
  }
  return { boost: 0 };
}

export function detectClearanceSignals(
  text: string,
  modules: ResumeModule[]
): { reason?: string } {
  const clearanceInJob =
    /\bclearance\b/i.test(text) ||
    /\bu\.?s\.?\s+citizen/i.test(text) ||
    /\bcitizenship\b/i.test(text);
  if (!clearanceInJob) {
    return {};
  }
  const moduleText = modules
    .filter((m) => m.isActive)
    .flatMap((m) => [...m.tags, ...m.skills, m.summary, ...(m.proof ?? [])])
    .join(" ")
    .toLowerCase();
  const hasClearanceSignal =
    /\bclearance\b/i.test(moduleText) ||
    /\bcitizen/i.test(moduleText) ||
    /\bsecurity\b/i.test(moduleText);
  if (hasClearanceSignal) {
    return { reason: "Clearance or citizenship language is relevant for this posting." };
  }
  return {};
}

export function detectCompanyPreference(
  company: string | undefined,
  modules: ResumeModule[],
  sourceName?: string
): { nudge: number; reason?: string } {
  const companyNorm = (company ?? "").trim().toLowerCase();
  if (!companyNorm && !sourceName) {
    return { nudge: 0 };
  }

  const moduleText = modules
    .filter((m) => m.isActive)
    .flatMap((m) => [...m.tags, m.title])
    .join(" ")
    .toLowerCase();

  const sourceNorm = (sourceName ?? "").trim().toLowerCase();
  const companyInSource =
    companyNorm.length > 2 && sourceNorm.includes(companyNorm.split(/\s+/)[0] ?? "");
  const companyInModules = companyNorm.length > 2 && moduleText.includes(companyNorm.split(/\s+/)[0] ?? "");

  if (companyInSource || companyInModules) {
    return { nudge: 3, reason: "Company appears in saved source preferences." };
  }
  return { nudge: 0 };
}

export function detectLocationSignal(
  location: string | undefined,
  description: string
): { missingSignal?: string; reason?: string } {
  const loc = location?.trim();
  if (loc) {
    return { reason: `Location listed: ${loc}.` };
  }
  const remoteHint = /\bremote\b|\bhybrid\b|\bonsite\b|\bon-site\b/i.test(description);
  if (!remoteHint) {
    return { missingSignal: "Location not clear." };
  }
  return {};
}

export function buildFitLabel(score: number, hardDisqualifier: boolean): JobFitLabel {
  if (hardDisqualifier || score < FIT_LABEL_THRESHOLDS.stretch) {
    return "bad_fit";
  }
  if (score >= FIT_LABEL_THRESHOLDS.strong) {
    return "strong";
  }
  if (score >= FIT_LABEL_THRESHOLDS.possible) {
    return "possible";
  }
  return "stretch";
}

export function getFitLabel(score: number, hardDisqualifier = false): JobFitLabel {
  return buildFitLabel(score, hardDisqualifier);
}

export function getFitLabelDisplay(label: JobFitLabel): string {
  switch (label) {
    case "strong":
      return "Strong fit";
    case "possible":
      return "Possible fit";
    case "stretch":
      return "Stretch fit";
    case "bad_fit":
      return "Bad fit";
  }
}

/** @deprecated Legacy 3-tier alias — maps from score using stretch threshold as mixed cutoff */
export function getFitTier(score: number): FitTier {
  const label = getFitLabel(score);
  if (label === "strong") {
    return "strong";
  }
  if (label === "bad_fit") {
    return "weak";
  }
  return "mixed";
}

/** @deprecated Legacy 3-tier display alias */
export function getFitTierLabel(score: number): string {
  const tier = getFitTier(score);
  if (tier === "strong") {
    return "Strong fit";
  }
  if (tier === "mixed") {
    return "Mixed fit";
  }
  return "Weak fit";
}

export function formatFitScore(score: number, fitLabel?: JobFitLabel): string {
  const label = fitLabel ?? getFitLabel(score);
  return `${getFitLabelDisplay(label)} (${score})`;
}

export function resolveCandidateFitLabel(candidate: Pick<JobCandidate, "fitScore" | "fitLabel">): JobFitLabel {
  return candidate.fitLabel ?? getFitLabel(candidate.fitScore);
}

export function createResumeModule(
  input: Omit<ResumeModule, "id"> & { id?: string }
): ResumeModule {
  return {
    id: input.id ?? createId("resume-module"),
    title: input.title,
    category: input.category,
    summary: input.summary,
    tags: input.tags,
    bullets: input.bullets,
    skills: input.skills,
    projects: input.projects,
    bestFor: input.bestFor,
    proof: input.proof,
    isActive: input.isActive,
    resumePlacement: input.resumePlacement
  };
}

interface ModuleScore {
  module: ResumeModule;
  points: number;
  reasons: string[];
}

function scoreModuleAgainstText(module: ResumeModule, text: string, roleType: RoleType): ModuleScore {
  let points = 0;
  const reasons: string[] = [];

  if (module.bestFor.includes(roleType)) {
    points += 15;
    reasons.push(`Role type fits ${module.title}`);
  }

  for (const tag of module.tags) {
    if (hasWordMatch(text, tag)) {
      points += 8;
      reasons.push(`Matched tag: ${tag}`);
    }
  }

  for (const skill of module.skills) {
    if (hasWordMatch(text, skill)) {
      points += 10;
      reasons.push(`Matched skill: ${skill}`);
    }
  }

  for (const bullet of module.bullets) {
    const tokens = bullet
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 3)
      .slice(0, 3);
    const matched = tokens.some((token) => hasWordMatch(text, token));
    if (matched) {
      points += 5;
      reasons.push(`Matched bullet from ${module.title}`);
      break;
    }
  }

  return { module, points, reasons };
}

export function buildResumeAngle(
  moduleScores: ModuleScore[],
  matchedSkills: string[],
  roleType: RoleType
): string {
  const topTitles = moduleScores.slice(0, 2).map((entry) => entry.module.title);
  const skillHint =
    matchedSkills.length > 0 ? ` Emphasize ${matchedSkills.slice(0, 4).join(", ")}.` : "";
  if (topTitles.length > 0) {
    return `Lead with ${topTitles.join(" and ")} for this ${roleType} role.${skillHint}`;
  }
  return `Review resume bank manually for this ${roleType} role.${skillHint}`;
}

export function scoreJobCandidate(
  candidate: ScoreJobCandidateInput,
  modules: ResumeModule[]
): Pick<
  JobCandidate,
  | "fitScore"
  | "fitLabel"
  | "fitReasons"
  | "gaps"
  | "matchedSkills"
  | "missingSignals"
  | "recommendedResumeAngle"
  | "suggestedResumeModuleIds"
> {
  const text = getSearchText(candidate);
  const activeModules = modules.filter((module) => module.isActive);
  const moduleScores = activeModules
    .map((module) => scoreModuleAgainstText(module, text, candidate.roleType))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points);

  let rawScore = moduleScores.reduce((total, entry) => total + entry.points, 0);
  const fitReasons: string[] = moduleScores.flatMap((entry) => entry.reasons);

  const entryLevel = detectEntryLevelSignals(text);
  if (entryLevel.boost > 0) {
    rawScore += entryLevel.boost;
    if (entryLevel.reason) {
      fitReasons.push(entryLevel.reason);
    }
  }

  const security = detectSecuritySignals(text, activeModules);
  if (security.boost > 0) {
    rawScore += security.boost;
    if (security.reason) {
      fitReasons.push(security.reason);
    }
  }

  const clearance = detectClearanceSignals(text, activeModules);
  if (clearance.reason) {
    fitReasons.push(clearance.reason);
  }

  const companyPref = detectCompanyPreference(candidate.company, activeModules, candidate.sourceName);
  if (companyPref.nudge > 0) {
    rawScore += companyPref.nudge;
  }
  if (companyPref.reason) {
    fitReasons.push(companyPref.reason);
  }

  const locationSignal = detectLocationSignal(candidate.location, candidate.description);
  if (locationSignal.reason) {
    fitReasons.push(locationSignal.reason);
  }

  const seniority = detectSeniorityMismatch(candidate.roleTitle, candidate.description);
  rawScore -= seniority.penalty;

  const gaps: string[] = [];
  const missingSignals: string[] = [];
  if (seniority.gap) {
    gaps.push(seniority.gap);
  }
  if (locationSignal.missingSignal) {
    missingSignals.push(locationSignal.missingSignal);
  }

  const roleTypeCovered = moduleScores.some((entry) =>
    entry.module.bestFor.includes(candidate.roleType)
  );
  if (!roleTypeCovered) {
    gaps.push(`Limited resume modules tagged for ${candidate.roleType}.`);
  }

  const missingKeywords = DESCRIPTION_KEYWORDS.filter(
    (keyword) =>
      hasWordMatch(text, keyword) &&
      !moduleScores.some(
        (entry) =>
          hasWordMatch(entry.module.skills.join(" "), keyword) ||
          hasWordMatch(entry.module.tags.join(" "), keyword)
      )
  );
  if (missingKeywords.length > 0) {
    gaps.push(`Job mentions ${missingKeywords.slice(0, 3).join(", ")} with limited module overlap.`);
  }

  let fitScore = Math.min(100, Math.max(0, Math.round(rawScore)));
  if (seniority.hardDisqualifier) {
    fitScore = Math.min(fitScore, 35);
  }

  const matchedSkills = extractMatchedSkills(text, activeModules);
  const fitLabel = buildFitLabel(fitScore, seniority.hardDisqualifier);

  if (fitLabel === "stretch" || fitLabel === "bad_fit") {
    if (!gaps.some((gap) => gap.includes("review manually"))) {
      gaps.push(
        fitLabel === "bad_fit"
          ? "Bad fit — review manually before applying."
          : "Stretch fit — confirm gaps before applying."
      );
    }
  }

  const suggestedResumeModuleIds = moduleScores.slice(0, 4).map((entry) => entry.module.id);
  const recommendedResumeAngle = buildResumeAngle(moduleScores, matchedSkills, candidate.roleType);

  return {
    fitScore,
    fitLabel,
    fitReasons: fitReasons.slice(0, 8),
    gaps: gaps.slice(0, 6),
    matchedSkills,
    missingSignals,
    recommendedResumeAngle,
    suggestedResumeModuleIds
  };
}

export function getSuggestedResumeModules(
  candidate: Pick<JobCandidate, "suggestedResumeModuleIds">,
  modules: ResumeModule[],
  limit = 4
): ResumeModule[] {
  return candidate.suggestedResumeModuleIds
    .slice(0, limit)
    .map((id) => modules.find((module) => module.id === id))
    .filter((module): module is ResumeModule => module !== undefined);
}

export function createJobCandidate(
  input: JobCandidateIntakeInput,
  modules: ResumeModule[],
  status: JobCandidateStatus = "new",
  options?: { sourceName?: string }
): JobCandidate {
  const scored = scoreJobCandidate(
    {
      roleTitle: input.roleTitle,
      description: input.description,
      roleType: input.roleType,
      company: input.company,
      location: input.location,
      sourceName: options?.sourceName
    },
    modules
  );
  const fitLabel = scored.fitLabel ?? getFitLabel(scored.fitScore);

  return {
    id: createId("job-candidate"),
    sourceId: input.sourceId,
    company: input.company.trim(),
    roleTitle: input.roleTitle.trim(),
    sourceUrl: input.sourceUrl?.trim() || undefined,
    location: input.location?.trim() || undefined,
    description: input.description.trim(),
    roleType: input.roleType,
    discoveredAt: nowIso(),
    origin: input.origin ?? "manual",
    status,
    nextTinyAction:
      fitLabel === "strong"
        ? "Review suggested modules and approve to application card."
        : fitLabel === "possible" || fitLabel === "stretch"
          ? "Compare gaps against resume bank, then save or approve."
          : "Review manually — weak keyword fit.",
    ...scored
  };
}

export function saveJobCandidate(candidate: JobCandidate): JobCandidate {
  return { ...candidate, status: "saved" };
}

export function dismissJobCandidate(candidate: JobCandidate): JobCandidate {
  return { ...candidate, status: "dismissed" };
}

export function buildCareerIntakeFromCandidate(
  candidate: JobCandidate,
  modules: ResumeModule[]
): CareerIntakeInput {
  const suggested = getSuggestedResumeModules(candidate, modules);
  const bullets = suggested.flatMap((module) => module.bullets).slice(0, 6);

  return {
    company: candidate.company,
    roleTitle: candidate.roleTitle,
    sourceUrl: candidate.sourceUrl,
    jobDescription: candidate.description,
    roleType: candidate.roleType,
    applicationStatus: "inbox",
    resumeAngle: candidate.recommendedResumeAngle,
    projectsToEmphasize: suggested.map((module) => module.title).join("; ") || undefined,
    bulletsToEmphasize: bullets.join(" · ") || undefined,
    jobCandidateId: candidate.id
  };
}

export function countManualCandidates(candidates: JobCandidate[]): number {
  return candidates.filter(
    (candidate) => candidate.origin === "manual" && candidate.status !== "dismissed"
  ).length;
}

function countSuccessfulManualSourceRuns(runs: JobSourceRunResult[]): number {
  return runs.filter((run) => run.errors.length === 0).length;
}

function countFetchedCandidates(candidates: JobCandidate[]): number {
  return candidates.filter((candidate) => candidate.origin === "source_fetch").length;
}

function countApprovedFromSourceFetch(candidates: JobCandidate[]): number {
  return candidates.filter(
    (candidate) => candidate.origin === "source_fetch" && candidate.status === "card_created"
  ).length;
}

export function buildJobScoutStats(
  candidates: JobCandidate[],
  modules: ResumeModule[],
  sources: JobSource[],
  jobSourceRuns: JobSourceRunResult[] = []
): JobScoutStats {
  const reviewCandidates = candidates.filter(
    (candidate) => candidate.status === "new" || candidate.status === "saved"
  );
  const averageFitScore =
    reviewCandidates.length === 0
      ? 0
      : Math.round(
          reviewCandidates.reduce((total, candidate) => total + candidate.fitScore, 0) /
            reviewCandidates.length
        );
  const lastRun = jobSourceRuns[0];

  return {
    activeResumeModules: modules.filter((module) => module.isActive).length,
    candidatesSaved: candidates.filter((candidate) => candidate.status === "saved").length,
    candidatesApproved: candidates.filter((candidate) => candidate.status === "card_created").length,
    candidatesDismissed: candidates.filter((candidate) => candidate.status === "dismissed").length,
    averageFitScore,
    jobSourcesConfigured: sources.length,
    enabledSources: sources.filter((source) => source.enabled).length,
    sourcesRun: countSuccessfulManualSourceRuns(jobSourceRuns),
    candidatesFetched: countFetchedCandidates(candidates),
    candidatesApprovedFromFetch: countApprovedFromSourceFetch(candidates),
    skippedDuplicatesTotal: jobSourceRuns.reduce(
      (total, run) => total + run.skippedDuplicates,
      0
    ),
    lastSourceRunAt: lastRun?.fetchedAt,
    manualCandidates: countManualCandidates(candidates)
  };
}

export function buildCandidateBriefingSignals(
  candidates: JobCandidate[],
  sources: JobSource[],
  jobSourceRuns: JobSourceRunResult[] = []
): CandidateBriefingSignals {
  const savedWaiting = candidates.filter((candidate) => candidate.status === "saved").length;
  const strongFitCandidates = candidates.filter(
    (candidate) =>
      (candidate.status === "new" || candidate.status === "saved") &&
      resolveCandidateFitLabel(candidate) === "strong"
  );
  const fetchedWaiting = candidates.filter(
    (candidate) =>
      candidate.origin === "source_fetch" &&
      (candidate.status === "new" || candidate.status === "saved")
  ).length;
  const strongFitFetchedCandidates = candidates.filter(
    (candidate) =>
      candidate.origin === "source_fetch" &&
      (candidate.status === "new" || candidate.status === "saved") &&
      resolveCandidateFitLabel(candidate) === "strong"
  );
  const lastSuccessfulRun = jobSourceRuns.find((run) => run.errors.length === 0);
  const lastSource = lastSuccessfulRun
    ? sources.find((source) => source.id === lastSuccessfulRun.sourceId)
    : undefined;

  return {
    savedWaiting,
    strongFitCandidates,
    fetchedWaiting,
    strongFitFetchedCandidates,
    sourcesConfigured: sources.length,
    enabledSources: sources.filter((source) => source.enabled).length,
    lastSuccessfulSourceRun:
      lastSuccessfulRun && lastSource
        ? {
            sourceName: lastSource.name,
            fetchedCount: lastSuccessfulRun.createdCandidateIds.length
          }
        : undefined
  };
}

function isFollowUpLog(log: LifeLogEntry): boolean {
  return /follow-up|texted|emailed/i.test(log.rawText);
}

function isAppliedLog(log: LifeLogEntry): boolean {
  return /\bapplied\b/i.test(log.rawText);
}

export function checkJobScoutLocks(
  candidates: JobCandidate[],
  cards: LifeCard[],
  logs: LifeLogEntry[],
  jobSourceRuns: JobSourceRunResult[] = []
) {
  const manualApplications = cards.filter(
    (card) =>
      card.careerApplication && ["waiting", "done"].includes(card.state)
  ).length;
  const appliedLogs = logs.filter(
    (log) => log.area === "social_career" && isAppliedLog(log)
  ).length;
  const careerActions = logs.filter(
    (log) => log.area === "social_career" && log.type === "win"
  ).length;
  const successfulRuns = countSuccessfulManualSourceRuns(jobSourceRuns);

  return [
    {
      id: "manual-run-fetching",
      label: "Manual-run source fetching",
      current: 1,
      required: 1,
      enabled: true as const
    },
    {
      id: "scheduled-fetching",
      label: "Scheduled source fetching",
      current: successfulRuns,
      required: 5
    },
    {
      id: "ai-matching",
      label: "AI matching",
      current: careerActions,
      required: 10
    },
    {
      id: "resume-automation",
      label: "Resume automation",
      current: Math.max(manualApplications, appliedLogs),
      required: 5
    },
    {
      id: "auto-apply",
      label: "Auto-apply",
      current: 0,
      required: 0,
      notSupported: true as const
    }
  ];
}

export function countFitLabels(candidates: JobCandidate[]): {
  strongCount: number;
  possibleCount: number;
  stretchCount: number;
  badFitCount: number;
} {
  const counts = { strongCount: 0, possibleCount: 0, stretchCount: 0, badFitCount: 0 };
  for (const candidate of candidates) {
    const label = resolveCandidateFitLabel(candidate);
    if (label === "strong") {
      counts.strongCount += 1;
    } else if (label === "possible") {
      counts.possibleCount += 1;
    } else if (label === "stretch") {
      counts.stretchCount += 1;
    } else {
      counts.badFitCount += 1;
    }
  }
  return counts;
}

export function formatFitFinderNotice(input: {
  createdCandidates: JobCandidate[];
  skippedDuplicates: number;
}): string {
  const total = input.createdCandidates.length;
  const { strongCount, possibleCount, stretchCount, badFitCount } = countFitLabels(
    input.createdCandidates
  );
  const reviewableCount = strongCount + possibleCount + stretchCount;

  if (total === 0) {
    const dupNote =
      input.skippedDuplicates > 0
        ? ` Skipped ${input.skippedDuplicates} duplicate${input.skippedDuplicates === 1 ? "" : "s"}.`
        : "";
    return `No fit matches found yet. Try another source or paste a posting.${dupNote}`;
  }

  const tierParts: string[] = [];
  if (strongCount > 0) {
    tierParts.push(`${strongCount} strong`);
  }
  if (possibleCount > 0) {
    tierParts.push(`${possibleCount} possible`);
  }
  if (stretchCount > 0) {
    tierParts.push(`${stretchCount} stretch`);
  }
  if (badFitCount > 0) {
    tierParts.push(`${badFitCount} bad fit`);
  }

  const dupNote =
    input.skippedDuplicates > 0
      ? ` Skipped ${input.skippedDuplicates} duplicate${input.skippedDuplicates === 1 ? "" : "s"}.`
      : "";

  const matchWord = reviewableCount === 1 ? "match" : "matches";
  return `Found ${reviewableCount > 0 ? reviewableCount : total} fit ${matchWord}: ${tierParts.join(", ")}.${dupNote}`;
}

export function buildFitFinderResult(input: {
  ok: boolean;
  runnerUnreachable?: boolean;
  createdCandidates: JobCandidate[];
  skippedDuplicates: number;
  errors?: string[];
  noSourcesMessage?: string;
  runnerMessage?: string;
}): FitFinderResult {
  if (input.noSourcesMessage) {
    return {
      ok: false,
      runnerUnreachable: false,
      createdCandidateIds: [],
      skippedDuplicates: 0,
      strongCount: 0,
      possibleCount: 0,
      stretchCount: 0,
      badFitCount: 0,
      errors: [],
      message: input.noSourcesMessage
    };
  }

  if (input.runnerUnreachable && input.runnerMessage) {
    return {
      ok: false,
      runnerUnreachable: true,
      createdCandidateIds: [],
      skippedDuplicates: input.skippedDuplicates,
      strongCount: 0,
      possibleCount: 0,
      stretchCount: 0,
      badFitCount: 0,
      errors: input.errors ?? [],
      message: input.runnerMessage
    };
  }

  const counts = countFitLabels(input.createdCandidates);
  const message = formatFitFinderNotice({
    createdCandidates: input.createdCandidates,
    skippedDuplicates: input.skippedDuplicates
  });

  return {
    ok: input.ok,
    runnerUnreachable: input.runnerUnreachable ?? false,
    createdCandidateIds: input.createdCandidates.map((c) => c.id),
    skippedDuplicates: input.skippedDuplicates,
    ...counts,
    errors: input.errors ?? [],
    message
  };
}
