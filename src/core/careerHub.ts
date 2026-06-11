import { buildCareerPipelineState } from "./careerPipeline";
import type { JobBoardTab } from "./jobBoardTab";
import type {
  JobCandidate,
  JobSource,
  JobSourceRunResult,
  LifeCard,
  ResumeModule
} from "./types";

export interface CareerHubNextAction {
  title: string;
  reason: string;
  ctaLabel: string;
  href: string;
  tab?: JobBoardTab;
}

export interface CareerHubQueuePreviewItem {
  id: string;
  title: string;
  detail: string;
  href: string;
}

export interface CareerHubSummary {
  nextAction: CareerHubNextAction;
  queueCount: number;
  activeApplicationCount: number;
  waitingApplicationCount: number;
  followUpCount: number;
  dueSourceCount: number;
  enabledSourceCount: number;
  resumeModuleCount: number;
  activeResumeModuleCount: number;
  hasCareerPack: boolean;
  lastRun?: {
    sourceName: string;
    timestamp: string;
    createdCount: number;
  };
  queuePreview: CareerHubQueuePreviewItem[];
  followUpPreview: CareerHubQueuePreviewItem[];
  applicationPreview: CareerHubQueuePreviewItem[];
}

export interface CareerHubSummaryInput {
  jobCandidates: JobCandidate[];
  cards: LifeCard[];
  jobSources: JobSource[];
  jobSourceRuns: JobSourceRunResult[];
  resumeModules: ResumeModule[];
  hasCareerPack: boolean;
  now: Date;
}

function candidateTitle(candidate: JobCandidate): string {
  return `${candidate.company} - ${candidate.roleTitle}`;
}

function cardDetail(card: LifeCard): string {
  const status = card.careerApplication?.applicationStatus ?? card.state;
  return `${status} - ${card.nextTinyAction}`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function buildCareerHubSummary(input: CareerHubSummaryInput): CareerHubSummary {
  const pipeline = buildCareerPipelineState(
    input.jobCandidates,
    input.cards,
    input.jobSources,
    input.jobSourceRuns,
    input.now
  );

  const queueCandidates = input.jobCandidates.filter(
    (candidate) => candidate.status === "new" || candidate.status === "saved"
  );
  const applicationCards = input.cards.filter((card) => card.careerApplication);
  const activeResumeModules = input.resumeModules.filter((module) => module.isActive);
  const runnableOrEnabledSources = input.jobSources.filter((source) => source.enabled);

  let nextAction: CareerHubNextAction;
  const firstFollowUp = pipeline.followUpsDue[0];
  const firstQueueCandidate = queueCandidates[0];

  if (firstFollowUp) {
    nextAction = {
      title: `Follow up: ${firstFollowUp.title}`,
      reason: `${pipeline.followUpsDue.length} ${pluralize(
        pipeline.followUpsDue.length,
        "contract needs",
        "contracts need"
      )} a follow-up before more tooling.`,
      ctaLabel: "Open follow-up",
      href: `/card/${firstFollowUp.id}`,
      tab: "followup"
    };
  } else if (firstQueueCandidate) {
    nextAction = {
      title: "Work the application queue",
      reason: `${queueCandidates.length} ${pluralize(
        queueCandidates.length,
        "candidate is",
        "candidates are"
      )} waiting for a resume angle or application card.`,
      ctaLabel: "Review matches",
      href: "/career?tab=review",
      tab: "review"
    };
  } else if (input.jobCandidates.length === 0 && applicationCards.length === 0) {
    nextAction = {
      title: "Paste one job description",
      reason: "No current contract is in motion. Start with one concrete posting.",
      ctaLabel: "Add a job",
      href: "/career?add=1&tab=find",
      tab: "find"
    };
  } else if (activeResumeModules.length === 0 || input.resumeModules.length === 0) {
    nextAction = {
      title: "Add source material",
      reason: "Resume artifacts are empty, so matching cannot make a useful application angle yet.",
      ctaLabel: "Open Resume Bank",
      href: "/resume-bank"
    };
  } else if (runnableOrEnabledSources.length > 0 || pipeline.dueSources > 0) {
    nextAction = {
      title: "Check approved sources",
      reason:
        pipeline.dueSources > 0
          ? `${pipeline.dueSources} approved ${pluralize(pipeline.dueSources, "source is", "sources are")} due.`
          : "Approved sources are available when you want fresh candidates.",
      ctaLabel: "Find jobs",
      href: "/career?tab=find",
      tab: "find"
    };
  } else {
    nextAction = {
      title: "Paste one job description",
      reason: "The next useful career move is one manual job post, not more setup.",
      ctaLabel: "Add a job",
      href: "/career?add=1&tab=find",
      tab: "find"
    };
  }

  return {
    nextAction,
    queueCount: queueCandidates.length,
    activeApplicationCount: pipeline.activeApplications.length,
    waitingApplicationCount: pipeline.waitingApplications.length,
    followUpCount: pipeline.followUpsDue.length,
    dueSourceCount: pipeline.dueSources,
    enabledSourceCount: pipeline.enabledSources,
    resumeModuleCount: input.resumeModules.length,
    activeResumeModuleCount: activeResumeModules.length,
    hasCareerPack: input.hasCareerPack,
    lastRun: pipeline.lastRun
      ? {
          sourceName: pipeline.lastRun.sourceName,
          timestamp: pipeline.lastRun.timestamp,
          createdCount: pipeline.lastRun.createdCount
        }
      : undefined,
    queuePreview: queueCandidates.slice(0, 3).map((candidate) => ({
      id: candidate.id,
      title: candidateTitle(candidate),
      detail: `${candidate.status} - ${candidate.nextTinyAction}`,
      href: "/career?tab=review"
    })),
    followUpPreview: pipeline.followUpsDue.slice(0, 3).map((card) => ({
      id: card.id,
      title: card.title,
      detail: cardDetail(card),
      href: `/card/${card.id}`
    })),
    applicationPreview: [...pipeline.activeApplications, ...pipeline.waitingApplications]
      .slice(0, 3)
      .map((card) => ({
        id: card.id,
        title: card.title,
        detail: cardDetail(card),
        href: `/card/${card.id}`
      }))
  };
}
