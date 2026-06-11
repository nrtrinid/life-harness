import type { StoredCareerSourcePack } from "./careerSourcePack";
import type {
  DailyState,
  HarnessAgentSession,
  HarnessChatSummary,
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
  careerSourcePack: StoredCareerSourcePack | null;
}
