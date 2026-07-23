import type { StoredCareerSourcePack } from "./careerSourcePack";
import type {
  DailyState,
  JobSourcePack,
  HarnessAgentSession,
  HarnessChatSummary,
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintExecutionAttempt,
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
  /** Durable single-action execution attempts (optional; hydrate defaults to []). */
  featureSprintExecutionAttempts?: HarnessFeatureSprintExecutionAttempt[];
  careerSourcePack: StoredCareerSourcePack | null;
  jobSourcePackMode?: JobSourcePack;
}
