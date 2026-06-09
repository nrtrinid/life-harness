import { type CareerIntakeInput } from "./career";
import { createId, nowIso } from "./ids";
import type {
  JobCandidate,
  JobCandidateOrigin,
  JobCandidateStatus,
  JobSource,
  JobSourceRunResult,
  LifeCard,
  LifeLogEntry,
  ResumeModule,
  RoleType
} from "./types";

export type FitTier = "strong" | "mixed" | "weak";

export const FIT_TIER_THRESHOLDS = {
  strong: 75,
  mixed: 45
} as const;

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

export function getFitTier(score: number): FitTier {
  if (score >= FIT_TIER_THRESHOLDS.strong) {
    return "strong";
  }
  if (score >= FIT_TIER_THRESHOLDS.mixed) {
    return "mixed";
  }
  return "weak";
}

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

export function formatFitScore(score: number): string {
  return `${getFitTierLabel(score)} (${score})`;
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
    isActive: input.isActive
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

export function scoreJobCandidate(
  candidate: Pick<JobCandidate, "roleTitle" | "description" | "roleType">,
  modules: ResumeModule[]
): Pick<JobCandidate, "fitScore" | "fitReasons" | "gaps" | "recommendedResumeAngle" | "suggestedResumeModuleIds"> {
  const text = getSearchText(candidate);
  const activeModules = modules.filter((module) => module.isActive);
  const moduleScores = activeModules
    .map((module) => scoreModuleAgainstText(module, text, candidate.roleType))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points);

  const rawScore = moduleScores.reduce((total, entry) => total + entry.points, 0);
  const fitScore = Math.min(100, Math.round(rawScore));
  const fitReasons = moduleScores
    .flatMap((entry) => entry.reasons)
    .slice(0, 6);

  const gaps: string[] = [];
  const roleTypeCovered = moduleScores.some((entry) => entry.module.bestFor.includes(candidate.roleType));
  if (!roleTypeCovered) {
    gaps.push(`Limited resume modules tagged for ${candidate.roleType}.`);
  }

  const missingKeywords = DESCRIPTION_KEYWORDS.filter(
    (keyword) => hasWordMatch(text, keyword) && !moduleScores.some((entry) => hasWordMatch(entry.module.skills.join(" "), keyword) || hasWordMatch(entry.module.tags.join(" "), keyword))
  );
  if (missingKeywords.length > 0) {
    gaps.push(`Job mentions ${missingKeywords.slice(0, 3).join(", ")} with limited module overlap.`);
  }

  if (fitScore < FIT_TIER_THRESHOLDS.mixed) {
    gaps.push("Weak fit — review manually before applying.");
  }

  const suggestedResumeModuleIds = moduleScores.slice(0, 4).map((entry) => entry.module.id);
  const topTitles = moduleScores.slice(0, 2).map((entry) => entry.module.title);
  const recommendedResumeAngle =
    topTitles.length > 0
      ? `Lead with ${topTitles.join(" and ")} for this ${candidate.roleType} role.`
      : `Review resume bank manually for this ${candidate.roleType} role.`;

  return {
    fitScore,
    fitReasons,
    gaps,
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
  status: JobCandidateStatus = "new"
): JobCandidate {
  const scored = scoreJobCandidate(input, modules);
  const tier = getFitTier(scored.fitScore);

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
      tier === "strong"
        ? "Review suggested modules and approve to application card."
        : tier === "mixed"
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
      candidate.fitScore >= FIT_TIER_THRESHOLDS.strong
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
      candidate.fitScore >= FIT_TIER_THRESHOLDS.strong
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
