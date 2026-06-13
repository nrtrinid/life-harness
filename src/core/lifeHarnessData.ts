import type { StoredCareerSourcePack } from "./careerSourcePack";
import type {
  DailyState,
  JobSourcePack,
  HarnessAgentSession,
  HarnessChatSummary,
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintRunnerRun,
  HarnessMemoryItem,
  HarnessProject,
  JobCandidate,
  JobSource,
  JobSourceRunResult,
  LifeCard,
  LifeLogEntry,
  ProofItem,
  ResumeModule
} from "./types";

export interface LifeHarnessData {
  cards: LifeCard[];
  logs: LifeLogEntry[];
  proofItems: ProofItem[];
  dailyState: DailyState;
  resumeModules: ResumeModule[];
  jobCandidates: JobCandidate[];
  jobSources: JobSource[];
  jobSourceRuns: JobSourceRunResult[];
  chatSummaries: HarnessChatSummary[];
  memoryItems: HarnessMemoryItem[];
  projects: HarnessProject[];
  agentSessions: HarnessAgentSession[];
  featureSprintPlans: HarnessFeatureSprintPlan[];
  featureSprintRunnerRuns: HarnessFeatureSprintRunnerRun[];
  careerSourcePack: StoredCareerSourcePack | null;
  jobSourcePackMode?: JobSourcePack;
}
