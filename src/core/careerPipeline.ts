import { getFollowUpsDue } from "./career";
import { getDueJobSources } from "./jobSourceSchedule";
import type {
  CareerPipelineState,
  JobCandidate,
  JobSource,
  JobSourceRunResult,
  LifeCard
} from "./types";

/**
 * Builds aggregated career pipeline state for Career Hub overview.
 * Combines candidate queue status, application cards, follow-ups, and job sources.
 */
export function buildCareerPipelineState(
  jobCandidates: JobCandidate[],
  cards: LifeCard[],
  jobSources: JobSource[],
  jobSourceRuns: JobSourceRunResult[],
  now: Date
): CareerPipelineState {
  // Candidates waiting for review (new or saved)
  const candidatesWaiting = jobCandidates.filter(
    (c) => c.status === "new" || c.status === "saved"
  );

  const saved = candidatesWaiting.filter((c) => c.origin === "manual").length;
  const fetched = candidatesWaiting.filter((c) => c.origin === "source_fetch").length;

  // Application cards (career cards)
  const careerCards = cards.filter((c) => c.careerApplication);
  const activeApplications = careerCards.filter((c) => c.state === "active");
  const waitingApplications = careerCards.filter((c) => c.state === "waiting");

  // Follow-ups
  const followUpsDue = getFollowUpsDue(cards, now);
  const followUpsOverdue = followUpsDue.filter((c) => {
    const dueDate = new Date(c.careerApplication!.followUpDate!);
    return dueDate < now;
  });

  // Job sources
  const dueSources = getDueJobSources(jobSources, now).length;
  const enabledSources = jobSources.filter((s) => s.enabled).length;

  // Last run details
  const lastRun = jobSourceRuns[0];
  const lastRunDetail = lastRun
    ? {
        sourceName: jobSources.find((s) => s.id === lastRun.sourceId)?.name ?? "Unknown",
        timestamp: lastRun.fetchedAt,
        fetchedCount: lastRun.createdCandidateIds.length + lastRun.skippedDuplicates,
        createdCount: lastRun.createdCandidateIds.length
      }
    : undefined;

  return {
    candidatesWaiting: candidatesWaiting.length,
    candidatesByOrigin: { saved, fetched },
    activeApplications,
    waitingApplications,
    followUpsDue,
    followUpsOverdue,
    dueSources,
    enabledSources,
    lastRun: lastRunDetail
  };
}
