import { syncApplicationStatus } from "./career";
import { coerceAutomationPhase, normalizeFeatureSprintStep } from "./featureSprintOrchestrator";
import { normalizeFeatureSprintCurrentSlice } from "./featureSprintCurrentSlice";
import type { LifeHarnessData } from "./lifeHarnessData";
import { normalizeResumeModules } from "./resumeModuleBank";
import type {
  CardState,
  DailyState,
  HarnessFeatureSprintPlan,
  JobCandidate,
  JobSource,
  LifeCard
} from "./types";
import { seedJobSources, seedResumeModules, STARTER_JOB_SOURCE_IDS } from "../data/seedJobScout";

export const RUN_INTERRUPTED_MESSAGE = "Run interrupted — reset on load.";

export const MAX_JOB_SOURCE_RUNS = 50;

const VALID_CARD_STATES = new Set<CardState>([
  "inbox",
  "active",
  "parked",
  "waiting",
  "done",
  "killed"
]);

function todayDateString(from: Date): string {
  return from.toISOString().slice(0, 10);
}

function coerceCardState(state: unknown): CardState {
  if (typeof state === "string" && VALID_CARD_STATES.has(state as CardState)) {
    return state as CardState;
  }
  return "inbox";
}

function defaultDailyState(): DailyState {
  return {
    date: todayDateString(new Date()),
    mode: "normal",
    pounceStarted: false,
    minimumViableDayCompleted: false,
    salvageCompleted: false
  };
}

export function normalizeFeatureSprintPlan(plan: HarnessFeatureSprintPlan): HarnessFeatureSprintPlan {
  const body = plan.featureSpec?.body?.trim();
  const featureSpec =
    body && plan.featureSpec
      ? {
          ...plan.featureSpec,
          body
        }
      : undefined;
  const automationPhase = coerceAutomationPhase(plan.automationPhase);
  const currentSlice = normalizeFeatureSprintCurrentSlice(plan.currentSlice);

  return {
    ...plan,
    featureSpec,
    automationPhase,
    currentSlice,
    steps: plan.steps.map(normalizeFeatureSprintStep)
  };
}

export function normalizeFeatureSprintPlans(
  plans: HarnessFeatureSprintPlan[] | undefined
): HarnessFeatureSprintPlan[] {
  return (plans ?? []).map(normalizeFeatureSprintPlan);
}

export function normalizeData(partial: Partial<LifeHarnessData>): LifeHarnessData {
  const dailyPartial = (partial.dailyState ?? {}) as Partial<DailyState>;
  const dailyState: DailyState = {
    ...defaultDailyState(),
    ...dailyPartial,
    pounceStarted: dailyPartial.pounceStarted ?? false,
    minimumViableDayCompleted: dailyPartial.minimumViableDayCompleted ?? false,
    salvageCompleted: dailyPartial.salvageCompleted ?? false
  };

  const cards = (partial.cards ?? []).map((card) => ({
    ...card,
    state: coerceCardState(card.state),
    recentWins: card.recentWins ?? [],
    openLoops: card.openLoops ?? [],
    optimizationIdeas: card.optimizationIdeas ?? [],
    proofItemIds: card.proofItemIds ?? [],
    careerApplication: card.careerApplication
      ? {
          ...card.careerApplication,
          applicationStatus: coerceCardState(
            card.careerApplication.applicationStatus ?? card.state
          )
        }
      : undefined
  }));

  return {
    cards,
    logs: partial.logs ?? [],
    proofItems: partial.proofItems ?? [],
    dailyState,
    resumeModules: normalizeResumeModules(partial.resumeModules ?? []),
    jobCandidates: partial.jobCandidates ?? [],
    jobSources: partial.jobSources ?? [],
    jobSourceRuns: partial.jobSourceRuns ?? [],
    chatSummaries: partial.chatSummaries ?? [],
    memoryItems: partial.memoryItems ?? [],
    projects: partial.projects ?? [],
    agentSessions: partial.agentSessions ?? [],
    featureSprintPlans: normalizeFeatureSprintPlans(partial.featureSprintPlans),
    featureSprintRunnerRuns: partial.featureSprintRunnerRuns ?? [],
    careerSourcePack: partial.careerSourcePack ?? null,
    jobSourcePackMode: partial.jobSourcePackMode ?? "core"
  };
}

export interface MergeSeedDefaultsResult {
  data: LifeHarnessData;
  addedStarterSourceIds: string[];
}

export function mergeSeedDefaults(data: LifeHarnessData): MergeSeedDefaultsResult {
  const moduleIds = new Set(data.resumeModules.map((module) => module.id));
  const mergedModules = [
    ...data.resumeModules,
    ...seedResumeModules.filter((module) => !moduleIds.has(module.id))
  ];

  const sourceIds = new Set(data.jobSources.map((source) => source.id));
  const addedSources = seedJobSources.filter((source) => !sourceIds.has(source.id));
  const addedStarterSourceIds = addedSources
    .map((source) => source.id)
    .filter((id) => (STARTER_JOB_SOURCE_IDS as readonly string[]).includes(id));
  const mergedSources = [...data.jobSources, ...addedSources];

  return {
    data: {
      ...data,
      resumeModules: mergedModules,
      jobSources: mergedSources,
      jobSourcePackMode: data.jobSourcePackMode ?? "core"
    },
    addedStarterSourceIds
  };
}

export function mergeStarterSourceAnnouncements(
  data: LifeHarnessData,
  addedStarterSourceIds: string[]
): LifeHarnessData {
  if (addedStarterSourceIds.length === 0) {
    return data;
  }
  const existing = data.dailyState.newStarterSourceIds ?? [];
  const merged = [...new Set([...existing, ...addedStarterSourceIds])];
  return {
    ...data,
    dailyState: {
      ...data.dailyState,
      newStarterSourceIds: merged
    }
  };
}

function resetInterruptedJobSources(sources: JobSource[]): JobSource[] {
  return sources.map((source) => {
    if (source.runStatus !== "running") {
      return source;
    }
    return {
      ...source,
      runStatus: "error",
      lastRunMessage: RUN_INTERRUPTED_MESSAGE
    };
  });
}

function syncApplicationCards(cards: LifeCard[]): LifeCard[] {
  return cards.map((card) => {
    if (!card.careerApplication) {
      return card;
    }
    if (card.state === card.careerApplication.applicationStatus) {
      return card;
    }
    return syncApplicationStatus(card, card.state);
  });
}

function repairCandidateCardLinks(
  cards: LifeCard[],
  candidates: JobCandidate[]
): { cards: LifeCard[]; jobCandidates: JobCandidate[] } {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  let nextCards = cards.map((card) => ({ ...card }));
  let nextCandidates = candidates.map((candidate) => ({ ...candidate }));

  nextCandidates = nextCandidates.map((candidate) => {
    if (!candidate.applicationCardId) {
      return candidate;
    }
    const card = cardById.get(candidate.applicationCardId);
    if (!card?.careerApplication) {
      return { ...candidate, applicationCardId: undefined };
    }
    return candidate;
  });

  nextCards = nextCards.map((card) => {
    const jobCandidateId = card.careerApplication?.jobCandidateId;
    if (!jobCandidateId) {
      return card;
    }
    const candidate = candidateById.get(jobCandidateId);
    if (!candidate) {
      if (!card.careerApplication) {
        return card;
      }
      return {
        ...card,
        careerApplication: {
          ...card.careerApplication,
          jobCandidateId: undefined
        }
      };
    }
    return card;
  });

  const repairedCards = nextCards.map((card) => ({ ...card }));
  const repairedCandidates = nextCandidates.map((candidate) => ({ ...candidate }));

  for (let i = 0; i < repairedCandidates.length; i += 1) {
    const candidate = repairedCandidates[i];
    if (!candidate.applicationCardId) {
      continue;
    }
    const cardIndex = repairedCards.findIndex((item) => item.id === candidate.applicationCardId);
    if (cardIndex === -1) {
      continue;
    }
    const card = repairedCards[cardIndex];
    if (!card.careerApplication) {
      continue;
    }
    if (card.careerApplication.jobCandidateId !== candidate.id) {
      repairedCards[cardIndex] = {
        ...card,
        careerApplication: {
          ...card.careerApplication,
          jobCandidateId: candidate.id
        }
      };
    }
  }

  for (let i = 0; i < repairedCards.length; i += 1) {
    const card = repairedCards[i];
    const jobCandidateId = card.careerApplication?.jobCandidateId;
    if (!jobCandidateId) {
      continue;
    }
    const candidateIndex = repairedCandidates.findIndex((item) => item.id === jobCandidateId);
    if (candidateIndex === -1) {
      continue;
    }
    const candidate = repairedCandidates[candidateIndex];
    if (candidate.applicationCardId !== card.id) {
      repairedCandidates[candidateIndex] = {
        ...candidate,
        applicationCardId: card.id,
        status: candidate.status === "new" || candidate.status === "saved" ? "card_created" : candidate.status
      };
    }
  }

  return { cards: repairedCards, jobCandidates: repairedCandidates };
}

function capJobSourceRuns(data: LifeHarnessData): LifeHarnessData {
  if (data.jobSourceRuns.length <= MAX_JOB_SOURCE_RUNS) {
    return data;
  }
  return {
    ...data,
    jobSourceRuns: data.jobSourceRuns.slice(0, MAX_JOB_SOURCE_RUNS)
  };
}

export function hydrateState(data: LifeHarnessData, now = new Date()): LifeHarnessData {
  const today = todayDateString(now);
  let dailyState = { ...data.dailyState };

  if (dailyState.date !== today) {
    dailyState = {
      ...dailyState,
      date: today,
      pounceStarted: false,
      minimumViableDayCompleted: false,
      salvageCompleted: false
    };
  }

  let cards = syncApplicationCards(data.cards);
  const linkRepair = repairCandidateCardLinks(cards, data.jobCandidates);
  cards = linkRepair.cards;

  const hydrated: LifeHarnessData = {
    ...data,
    dailyState,
    cards,
    jobCandidates: linkRepair.jobCandidates,
    jobSources: resetInterruptedJobSources(data.jobSources)
  };

  return capJobSourceRuns(hydrated);
}

export function preparePersistedState(raw: Partial<LifeHarnessData>, now = new Date()): LifeHarnessData {
  const normalized = normalizeData(raw);
  const { data: merged, addedStarterSourceIds } = mergeSeedDefaults(normalized);
  const withAnnouncements = mergeStarterSourceAnnouncements(merged, addedStarterSourceIds);
  return hydrateState(withAnnouncements, now);
}
