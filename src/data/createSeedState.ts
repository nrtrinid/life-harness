import type { LifeHarnessData } from "../core/lifeHarnessData";
import { startSession } from "../core/briefing";
import { nowIso } from "../core/ids";
import type { DailyState } from "../core/types";
import {
  seedJobCandidates,
  seedJobSources,
  seedResumeModules
} from "./seedJobScout";
import { seedCards, seedDailyState, seedLogs, seedProofItems } from "./seed";

function cloneSeed<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function todayFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function createEmptyDailyState(sessionNow: string): DailyState {
  return {
    date: todayFromIso(sessionNow),
    mode: "normal",
    pounceStarted: false,
    minimumViableDayCompleted: false,
    salvageCompleted: false
  };
}

export function createCleanBootstrapState(sessionNow = nowIso()): LifeHarnessData {
  const dailyState = startSession(createEmptyDailyState(sessionNow), sessionNow);
  return {
    cards: [],
    logs: [],
    proofItems: [],
    dailyState,
    resumeModules: cloneSeed(seedResumeModules),
    jobCandidates: [],
    jobSources: cloneSeed(seedJobSources),
    jobSourceRuns: [],
    chatSummaries: [],
    memoryItems: [],
    projects: [],
    agentSessions: [],
    featureSprintPlans: [],
    featureSprintRunnerRuns: [],
    featureSprintExecutionAttempts: [],
    careerSourcePack: null
  };
}

export function createSeedState(sessionNow = nowIso()): LifeHarnessData {
  const dailyState = startSession(cloneSeed(seedDailyState), sessionNow);
  return {
    cards: cloneSeed(seedCards),
    logs: cloneSeed(seedLogs),
    proofItems: cloneSeed(seedProofItems),
    dailyState,
    resumeModules: cloneSeed(seedResumeModules),
    jobCandidates: cloneSeed(seedJobCandidates),
    jobSources: cloneSeed(seedJobSources),
    jobSourceRuns: [],
    chatSummaries: [],
    memoryItems: [],
    projects: [],
    agentSessions: [],
    featureSprintPlans: [],
    featureSprintRunnerRuns: [],
    featureSprintExecutionAttempts: [],
    careerSourcePack: null
  };
}
