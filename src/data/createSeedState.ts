import type { LifeHarnessData } from "../core/actions";
import { startSession } from "../core/briefing";
import { nowIso } from "../core/ids";
import {
  seedJobCandidates,
  seedJobSources,
  seedResumeModules
} from "./seedJobScout";
import { seedCards, seedDailyState, seedLogs, seedProofItems } from "./seed";

function cloneSeed<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
    careerSourcePack: null
  };
}
