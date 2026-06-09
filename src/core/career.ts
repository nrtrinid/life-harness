import { createId } from "./ids";
import { isTerminalState } from "./warmth";
import { checkJobScoutLocks } from "./jobScout";
import type {
  CardState,
  CareerApplication,
  JobCandidate,
  JobSource,
  JobSourceRunResult,
  LifeCard,
  LifeLogEntry,
  RoleType
} from "./types";

export interface CareerIntakeInput {
  company: string;
  roleTitle: string;
  sourceUrl?: string;
  jobDescription: string;
  roleType: RoleType;
  applicationStatus?: CardState;
  followUpDate?: string;
  resumeAngle?: string;
  projectsToEmphasize?: string;
  bulletsToEmphasize?: string;
  jobCandidateId?: string;
}

export function isApplicationCard(card: LifeCard): boolean {
  return card.careerApplication !== undefined;
}

export function syncApplicationStatus(card: LifeCard, newState: CardState): LifeCard {
  if (!card.careerApplication) {
    return { ...card, state: newState };
  }

  return {
    ...card,
    state: newState,
    careerApplication: {
      ...card.careerApplication,
      applicationStatus: newState
    }
  };
}

export function createCareerApplicationCard(input: CareerIntakeInput): LifeCard {
  const status: CardState = input.applicationStatus ?? "inbox";
  const careerApplication: CareerApplication = {
    company: input.company.trim(),
    roleTitle: input.roleTitle.trim(),
    sourceUrl: input.sourceUrl?.trim() || undefined,
    jobDescription: input.jobDescription.trim(),
    roleType: input.roleType,
    applicationStatus: status,
    resumeAngle: input.resumeAngle ?? "(choose resume angle)",
    projectsToEmphasize: input.projectsToEmphasize ?? "(projects to emphasize)",
    bulletsToEmphasize: input.bulletsToEmphasize,
    followUpDate: input.followUpDate,
    jobCandidateId: input.jobCandidateId
  };

  return {
    id: createId("card"),
    title: `${careerApplication.company} — ${careerApplication.roleTitle}`,
    area: "social_career",
    state: status,
    progress: 0,
    warmth: "cold",
    whyItMatters: "A concrete application keeps career momentum tied to outside-world action.",
    nextTinyAction: "Choose resume angle or identify 3 matching bullets.",
    doneForNow: "Resume angle chosen or 3 matching bullets identified.",
    doLane: "Choose resume angle or identify 3 matching bullets.",
    improveLane: "Do not automate resume generation until manual applications exist.",
    recentWins: [],
    openLoops: ["Resume angle", "Matching bullets"],
    optimizationIdeas: ["Resume automation", "Job-board scraping"],
    proofItemIds: [],
    sensitivity: "S2",
    careerApplication
  };
}

function todayDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function getFollowUpsDue(cards: LifeCard[], now: Date): LifeCard[] {
  const today = todayDateString(now);

  return cards.filter((card) => {
    if (!card.careerApplication?.followUpDate) {
      return false;
    }
    if (isTerminalState(card.state)) {
      return false;
    }
    return card.careerApplication.followUpDate <= today;
  });
}

function isFollowUpLog(log: LifeLogEntry): boolean {
  return /follow-up|texted|emailed/i.test(log.rawText);
}

function isAppliedLog(log: LifeLogEntry): boolean {
  return /\bapplied\b/i.test(log.rawText);
}

export function buildCareerStats(cards: LifeCard[], logs: LifeLogEntry[], now: Date) {
  const applicationCards = cards.filter(isApplicationCard);
  const applicationsStarted = applicationCards.length;
  const applicationsSubmitted = applicationCards.filter((card) =>
    ["waiting", "done"].includes(card.state)
  ).length;
  const appliedLogs = logs.filter(
    (log) => log.area === "social_career" && isAppliedLog(log)
  ).length;
  const followUpsDue = getFollowUpsDue(cards, now).length;
  const careerPounces = logs.filter(
    (log) => log.type === "pounce" && log.area === "social_career"
  ).length;

  return {
    applicationsStarted,
    applicationsSubmitted: Math.max(applicationsSubmitted, appliedLogs),
    followUpsDue,
    careerPounces
  };
}

export function checkCareerUseBeforeImproveLocks(
  cards: LifeCard[],
  logs: LifeLogEntry[],
  jobCandidates: JobCandidate[] = [],
  jobSourceRuns: JobSourceRunResult[] = []
) {
  return checkJobScoutLocks(jobCandidates, cards, logs, jobSourceRuns);
}
