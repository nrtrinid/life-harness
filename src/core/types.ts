import type {
  FeatureSprintRunnerProfile,
  FeatureSprintVerificationResult,
  FeatureSprintWorktreeCleanupStatus
} from "./featureSprintRunner";

export type LifeArea = "build" | "body" | "money_independence" | "social_career" | "stability_vices";

export type CardState = "inbox" | "active" | "parked" | "waiting" | "done" | "killed";

export type Warmth = "hot" | "warm" | "cooling" | "cold" | "dormant";

export type LogType = "win" | "leak" | "idea" | "pounce" | "salvage" | "mvd" | "clarity" | "calibration";

export type SensitivityLevel = "S0" | "S1" | "S2" | "S3";

export type RoleType =
  | "software"
  | "cybersecurity"
  | "it"
  | "full_stack"
  | "data_finance"
  | "other";

export type ApplicationStatus = CardState;

export interface CareerApplication {
  company: string;
  roleTitle: string;
  sourceUrl?: string;
  jobDescription: string;
  roleType: RoleType;
  applicationStatus: ApplicationStatus;
  resumeAngle?: string;
  projectsToEmphasize?: string;
  bulletsToEmphasize?: string;
  followUpDate?: string;
  jobCandidateId?: string;
  resumeDraftPacket?: ResumeDraftPacket;
}

export type ResumeModuleCategory =
  | "project"
  | "experience"
  | "education"
  | "skill_cluster"
  | "certification";

export type ResumeModuleSection =
  | "education"
  | "skills"
  | "projects"
  | "additional_experience";

export interface ResumeModulePlacement {
  section: ResumeModuleSection;
  heading: string;
  detail?: string;
  date?: string;
  order: number;
}

export interface ResumeModule {
  id: string;
  title: string;
  category: ResumeModuleCategory;
  summary: string;
  tags: string[];
  bullets: string[];
  skills: string[];
  projects?: string[];
  bestFor: RoleType[];
  proof?: string[];
  isActive: boolean;
  importedFromCareerPack?: boolean;
  resumePlacement?: ResumeModulePlacement;
}

export interface ResumeDraftPacketIssue {
  moduleId: string;
  moduleTitle: string;
  message: string;
}

export interface ResumeDraftPacket {
  createdAt: string;
  sourceCandidateId: string;
  company: string;
  roleTitle: string;
  resumeAngle: string;
  selectedModuleIds: string[];
  sectionCoverage: ResumeModuleSection[];
  missingEvidence: ResumeDraftPacketIssue[];
  nextTinyAction: string;
}

export type JobSourceKind =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "governmentjobs"
  | "workday"
  | "jobposting_jsonld"
  | "company_careers"
  | "manual";

export type JobSourceCadence = "manual" | "daily" | "weekly";

export type JobSourceRunStatus = "idle" | "running" | "success" | "error";

export type JobSourceRequestMethod = "GET" | "POST";

export type JobSourcePaginationMode = "none" | "workday_offset";

export interface JobSourcePaginationConfig {
  mode: JobSourcePaginationMode;
  limit?: number;
  maxPages?: number;
  maxResults?: number;
}

export interface JobSourceRequestConfig {
  method: JobSourceRequestMethod;
  bodyJson?: unknown;
  pagination?: JobSourcePaginationConfig;
}

export interface JobSource {
  id: string;
  name: string;
  url: string;
  kind: JobSourceKind;
  enabled: boolean;
  cadence: JobSourceCadence;
  lastCheckedAt?: string;
  notes?: string;
  runStatus?: JobSourceRunStatus;
  lastRunAt?: string;
  lastRunMessage?: string;
  lastFetchedCount?: number;
  maxResults?: number;
  adapterNotes?: string;
  requestConfig?: JobSourceRequestConfig;
}

export interface JobSourceRunResult {
  sourceId: string;
  fetchedAt: string;
  createdCandidateIds: string[];
  skippedDuplicates: number;
  errors: string[];
  message: string;
  pagesFetched?: number;
  paginationStoppedReason?: string;
}

export type JobSourceHealth =
  | "healthy"
  | "weak_pass"
  | "error"
  | "stale"
  | "never_run";

export type JobCandidateStatus = "new" | "saved" | "dismissed" | "card_created";

export type JobCandidateOrigin = "manual" | "source_fetch" | "import" | "agent";

export type JobFitLabel = "strong" | "possible" | "stretch" | "bad_fit";

export interface JobCandidate {
  id: string;
  sourceId?: string;
  company: string;
  roleTitle: string;
  sourceUrl?: string;
  location?: string;
  description: string;
  roleType: RoleType;
  discoveredAt: string;
  origin: JobCandidateOrigin;
  status: JobCandidateStatus;
  fitScore: number;
  fitLabel?: JobFitLabel;
  fitReasons: string[];
  gaps: string[];
  matchedSkills?: string[];
  missingSignals?: string[];
  recommendedResumeAngle?: string;
  suggestedResumeModuleIds: string[];
  nextTinyAction: string;
  applicationCardId?: string;
}

export interface TriggerPlan {
  cue: string;
  action: string;
}

export interface ObstaclePlan {
  wish?: string;
  outcome?: string;
  obstacle: string;
  plan: string;
}

export interface ResumePacket {
  whyItMatters?: string;
  lastState: string;
  nextTinyAction: string;
  openLoops: string[];
  reentryAction: string;
}

export interface LifeCard {
  id: string;
  title: string;
  area: LifeArea;
  state: CardState;
  progress: number;
  warmth: Warmth;
  whyItMatters?: string;
  nextTinyAction: string;
  doneForNow?: string;
  doLane?: string;
  improveLane?: string;
  triggerPlan?: TriggerPlan;
  obstaclePlan?: ObstaclePlan;
  lastTouched?: string;
  recentWins: string[];
  openLoops: string[];
  optimizationIdeas: string[];
  resumePacket?: ResumePacket;
  proofItemIds: string[];
  sensitivity?: SensitivityLevel;
  careerApplication?: CareerApplication;
}

export interface LifeLogEntry {
  id: string;
  timestamp: string;
  rawText: string;
  area: LifeArea;
  cardId?: string;
  type: LogType;
  xp: number;
  moneyDelta?: number;
  leakType?: "vice" | "money" | "energy" | "open_loop" | "scope_creep" | "avoidance";
  proofItemId?: string;
  sensitivity?: SensitivityLevel;
}

export interface ProofItem {
  id: string;
  timestamp: string;
  title: string;
  area?: LifeArea;
  cardId?: string;
  sourceLogId?: string;
}

export interface DailyState {
  date: string;
  mode: "normal" | "pounce" | "hyperfocus" | "salvage" | "recovery" | "reentry";
  mainQuestId?: string;
  pounceMission?: string;
  smallestStart?: string;
  pounceWindowStart?: string;
  pounceWindowEnd?: string;
  pounceStarted: boolean;
  minimumViableDayCompleted: boolean;
  salvageCompleted: boolean;
  lastOpenedAt?: string;
  sessionStartedAt?: string;
  briefingSinceAt?: string;
}

export interface Briefing {
  id: string;
  createdAt: string;
  title: string;
  updated: string[];
  detected: string[];
  prepared: string[];
}

export interface BriefingHighlight {
  text: string;
  cardId?: string;
}

export type HarnessChatSummaryMode = "operator" | "reflection" | "builder" | "general";

export interface HarnessChatSummary {
  id: string;
  createdAt: string;
  mode: HarnessChatSummaryMode;
  userMessage: string;
  assistantSummary: string;
  patterns: string[];
  decisions: string[];
  suggestedNextActions: string[];
  rememberForNextTime: string[];
}

export type HarnessMemoryKind =
  | "pattern"
  | "preference"
  | "trap"
  | "identity"
  | "project_fact"
  | "decision"
  | "rule";

export interface HarnessMemoryItem {
  id: string;
  kind: HarnessMemoryKind;
  title: string;
  summary: string;
  tags: string[];
  evidence?: string;
  sourceChatSummaryId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessProject {
  id: string;
  cardId: string;
  name: string;
  repoPath?: string;
  branch?: string;
  docs?: string[];
  likelyFiles?: string[];
  verificationCommands?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type HarnessAgentKind = "codex" | "cursor" | "chatgpt" | "local" | "manual" | "other";

export type HarnessAgentSessionStatus =
  | "planned"
  | "sent"
  | "reviewing"
  | "done"
  | "failed"
  | "parked";

export interface HarnessAgentSession {
  id: string;
  cardId: string;
  projectId?: string;
  agent: HarnessAgentKind;
  status: HarnessAgentSessionStatus;
  taskName: string;
  goal: string;
  promptExcerpt?: string;
  resultSummary?: string;
  filesChanged?: string[];
  verificationCommands?: string[];
  verificationResult?: string;
  commitHash?: string;
  followUps?: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  evidenceLogId?: string;
  evidenceProofItemId?: string;
}

export type HarnessFeatureSprintStatus =
  | "planning"
  | "in_progress"
  | "reviewing"
  | "done"
  | "parked";

export type HarnessFeatureSprintStepStatus =
  | "planned"
  | "ready"
  | "sent"
  | "reviewing"
  | "done"
  | "blocked"
  | "parked";

export type HarnessFeatureSprintReviewStatus =
  | "pending"
  | "accepted"
  | "needs_changes"
  | "blocked";

export type HarnessFeatureSprintStep = {
  id: string;
  title: string;
  goal: string;
  status: HarnessFeatureSprintStepStatus;
  acceptanceCriteria: string[];
  suggestedPrompt?: string;
  agentSessionId?: string;
  outputSummary?: string;
  reviewVerdict?: string;
  reviewStatus?: HarnessFeatureSprintReviewStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type HarnessFeatureSprintRunnerRunStatus = "running" | "succeeded" | "failed";

export type HarnessFeatureSprintRunnerRun = {
  id: string;
  profile: FeatureSprintRunnerProfile;
  status: HarnessFeatureSprintRunnerRunStatus;
  cardId?: string;
  planId?: string;
  stepId?: string;
  repoPath?: string;
  commandPreview?: string;
  outputExcerpt?: string;
  outputText?: string;
  error?: string;
  exitCode?: number;
  worktreePath?: string;
  branchName?: string;
  gitStatus?: string;
  diffStat?: string;
  changedFiles?: string[];
  diffText?: string;
  verificationResults?: FeatureSprintVerificationResult[];
  worktreeCleanedAt?: string;
  worktreeCleanupStatus?: FeatureSprintWorktreeCleanupStatus;
  worktreeCleanupMessage?: string;
  startedAt: string;
  completedAt?: string;
  importedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type HarnessFeatureSprintPlan = {
  id: string;
  cardId: string;
  projectId?: string;
  title: string;
  goal: string;
  status: HarnessFeatureSprintStatus;
  whyNow?: string;
  acceptanceCriteria: string[];
  nonGoals: string[];
  constraints: string[];
  steps: HarnessFeatureSprintStep[];
  currentStepId?: string;
  latestReviewVerdict?: string;
  latestReviewStatus?: HarnessFeatureSprintReviewStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  evidenceLogId?: string;
  evidenceProofItemId?: string;
};

export type PrimaryActionKind =
  | "park"
  | "follow_up"
  | "pounce"
  | "reheat"
  | "main_quest"
  | "capture"
  | "proof";

export interface PrimaryAction {
  kind: PrimaryActionKind;
  title: string;
  reason: string;
  smallestAction: string;
  cardId?: string;
  ctaLabel?: string;
  targetRoute?: string;
}

export interface CareerPipelineState {
  candidatesWaiting: number;
  candidatesByOrigin: {
    saved: number;
    fetched: number;
  };
  activeApplications: LifeCard[];
  waitingApplications: LifeCard[];
  followUpsDue: LifeCard[];
  followUpsOverdue: LifeCard[];
  dueSources: number;
  enabledSources: number;
  lastRun?: {
    sourceName: string;
    timestamp: string;
    fetchedCount: number;
    createdCount: number;
  };
}

export interface RecoveryVisibility {
  showSalvage: boolean;
  showMvd: boolean;
  shouldPromote: boolean;
  salvageReason?: string;
  mvdProgress: {
    completed: number;
    total: 4;
    items: string[];
  };
}
