import type {
  FeatureSprintRunnerAgent,
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
  | "icims"
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

export type JobSourcePack = "core" | "full";

export interface JobSource {
  id: string;
  name: string;
  url: string;
  kind: JobSourceKind;
  enabled: boolean;
  cadence: JobSourceCadence;
  sourcePack?: JobSourcePack;
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
  /** Starter sources merged this session — cleared when user dismisses banner */
  newStarterSourceIds?: string[];
  /** When set, demo triage banner stays hidden until reset. */
  demoTriageDismissedAt?: string;
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
  defaultRunnerAgent?: FeatureSprintRunnerAgent;
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

export type HarnessFeatureSpecSource = "chatgpt_web" | "manual" | "other";

export type HarnessFeatureSpec = {
  body: string;
  source?: HarnessFeatureSpecSource;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: "user";
};

export type HarnessFeatureSprintAutomationPhase =
  | "spec_unapproved"
  | "spec_approved"
  | "slice_scoping"
  | "localizing"
  | "prompt_auditing"
  | "implementing"
  | "proof_normalizing"
  | "reviewing"
  | "spec_updating"
  | "awaiting_user_approval";

export type HarnessFeatureSprintSlicePhase =
  | "ready"
  | "localizing"
  | "prompt_auditing"
  | "implementing"
  | "proof_pending"
  | "reviewing"
  | "spec_updating"
  | "awaiting_spec_approval"
  | "ready_to_advance"
  | "done";

export type HarnessFeatureSprintCurrentSliceStatus = "ready" | "active" | "blocked" | "done";

export type HarnessFeatureSprintCurrentSliceSource =
  | "planned_step"
  | "adopted_next_slice"
  | "manual";

export type HarnessFeatureSprintCurrentSlice = {
  id: string;
  title: string;
  summary?: string;
  status: HarnessFeatureSprintCurrentSliceStatus;
  phase: HarnessFeatureSprintSlicePhase;
  source: HarnessFeatureSprintCurrentSliceSource;
  linkedStepId?: string;
  riskTier?: "tiny" | "normal" | "risky";
  expectedFiles?: string[];
  createdAt: string;
  updatedAt: string;
};

export type HarnessFeatureSprintStepLocalization = {
  rawOutput: string;
  likelyFiles: string[];
  existingHelpers: string[];
  testsToRun: string[];
  risks: string[];
  revisedImplementationPrompt: string;
  createdAt: string;
  updatedAt: string;
};

export type HarnessFeatureSprintPromptAuditVerdict = "ready" | "tighten_first";

export type HarnessFeatureSprintStepPromptAudit = {
  rawOutput: string;
  verdict: HarnessFeatureSprintPromptAuditVerdict;
  risks: string[];
  requiredPromptChanges: string[];
  finalImplementationPrompt: string;
  mustCheckFiles: string[];
  verificationCommands: string[];
  createdAt: string;
  updatedAt: string;
};

export type HarnessFeatureSprintVerificationProofResult =
  | "pass"
  | "partial"
  | "fail"
  | "not_run";

export type HarnessFeatureSprintStepImplementationProofRunnerEvidence = {
  diffStat?: string;
  gitStatus?: string;
  verificationSummary?: string[];
};

export type HarnessFeatureSprintStepImplementationProof = {
  rawOutput: string;
  filesChanged: string[];
  behaviorChanged: string[];
  testsRun: string[];
  testsNotRun: string[];
  verificationResult: HarnessFeatureSprintVerificationProofResult;
  knownRisks: string[];
  suggestedReviewFocus: string[];
  sourceRunnerRunId?: string;
  runnerEvidence?: HarnessFeatureSprintStepImplementationProofRunnerEvidence;
  createdAt: string;
  updatedAt: string;
};

export type HarnessFeatureSprintStep = {
  id: string;
  title: string;
  goal: string;
  status: HarnessFeatureSprintStepStatus;
  acceptanceCriteria: string[];
  suggestedPrompt?: string;
  promptLocalization?: HarnessFeatureSprintStepLocalization;
  promptAudit?: HarnessFeatureSprintStepPromptAudit;
  implementationProof?: HarnessFeatureSprintStepImplementationProof;
  agentSessionId?: string;
  outputSummary?: string;
  reviewVerdict?: string;
  reviewStatus?: HarnessFeatureSprintReviewStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type HarnessFeatureSprintNextSliceProposal = {
  title: string;
  goal: string;
  acceptanceCriteria: string[];
  nonGoals: string[];
  riskTier?: "tiny" | "normal" | "risky";
};

export type HarnessFeatureSprintSpecUpdate = {
  stepId: string;
  revisedSpec: string;
  changelog: string[];
  completedSliceSummary: string;
  remainingWork: string[];
  featureComplete: boolean;
  importedAt: string;
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
  featureSpec?: HarnessFeatureSpec;
  latestSpecUpdate?: HarnessFeatureSprintSpecUpdate;
  nextSliceProposal?: HarnessFeatureSprintNextSliceProposal;
  automationPhase?: HarnessFeatureSprintAutomationPhase;
  currentSlice?: HarnessFeatureSprintCurrentSlice;
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
