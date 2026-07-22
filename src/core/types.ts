import type {
  FeatureSprintRunnerAgent,
  FeatureSprintRunnerFailureClass,
  FeatureSprintRunnerModelEvidenceSource,
  FeatureSprintRunnerProfile,
  FeatureSprintRunnerResultUsability,
  FeatureSprintRunnerTerminationReason,
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

export type HarnessFeatureSprintWorkerOutputSource =
  | "cursor_auto"
  | "cursor_agent"
  | "manual"
  | "runner"
  | "mock";

export type HarnessFeatureSprintWorkerOutputEvidence = {
  source: HarnessFeatureSprintWorkerOutputSource;
  rawOutput: string;
  summary?: string;
  changedFiles?: string[];
  testsRun?: string[];
  testOutput?: string;
  verificationCommands?: string[];
  warnings?: string[];
  knownLimitations?: string[];
  risks?: string[];
  diffStat?: string;
  withinScope?: boolean;
  scopeNotes?: string[];
  capturedAt: string;
};

export type HarnessFeatureSprintStepImplementationProofRunnerEvidence = {
  diffStat?: string;
  gitStatus?: string;
  verificationSummary?: string[];
  /** Optional Sprint Map correlation copied from the source runner run. */
  sprintId?: string;
  storyId?: string;
  taskId?: string;
  mapPhase?: HarnessFeatureSprintMapPhase;
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
  workerOutputEvidence?: HarnessFeatureSprintWorkerOutputEvidence;
  /** Frozen clarified-spec revision this proof claims to satisfy. */
  frozenSpecRevision?: number;
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
  workerOutputEvidence?: HarnessFeatureSprintWorkerOutputEvidence;
  agentSessionId?: string;
  outputSummary?: string;
  reviewVerdict?: string;
  reviewStatus?: HarnessFeatureSprintReviewStatus;
  /** Frozen clarified-spec revision bound to this step's execution artifacts. */
  frozenSpecRevision?: number;
  correctionAttempt?: number;
  maxCorrectionAttempts?: number;
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

/**
 * A plan has one authoritative execution model at a time.
 * - `legacy_steps`: currentStepId / steps[] gate launches (default when absent).
 * - `sprint_map`: executionTarget + sprintMap gate launches; steps[] remain a compatibility lens.
 * Seeding or importing a map does not flip authority until the plan deliberately adopts sprint_map.
 */
export type HarnessFeatureSprintExecutionModel = "legacy_steps" | "sprint_map";

/** Canonical task-phase pointer for Sprint Map agent runs. */
export type HarnessFeatureSprintMapPhase = "localize" | "implement" | "review";

/**
 * Schema-level container under a sprint is `Story`.
 * Product/execution label for research and infrastructure workflows is `Slice`
 * (an approved execution slice). Do not add a parallel `slices[]` collection.
 */
export type HarnessFeatureSprintMapNoticeCode =
  | "stale_execution_target"
  | "stale_linked_step"
  | "map_out_of_sync"
  | "seed_preview";

export type HarnessFeatureSprintMapNotice = {
  code: HarnessFeatureSprintMapNoticeCode;
  message: string;
  /** Dedupes the same condition across repeated hydration. */
  fingerprint: string;
  createdAt: string;
};

export type HarnessFeatureSprintTaskStatus =
  | "planned"
  | "ready"
  | "in_progress"
  | "blocked"
  | "done"
  | "parked";

export type HarnessFeatureSprintGateState = "open" | "blocked" | "passed";

export type HarnessFeatureSprintTaskScope = {
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  architecturalAreas?: string[];
  contractsMayChange?: string[];
  expectedFileCountBudget?: number;
};

export type HarnessFeatureSprintTaskAcceptanceCriterion = {
  id: string;
  text: string;
};

export type HarnessFeatureSprintTaskVerificationRequirement = {
  id: string;
  description: string;
  command?: string;
};

export type HarnessFeatureSprintDependency = {
  id: string;
  /** Prerequisite task id (must resolve inside the same feature map). */
  taskId: string;
  /** Defaults to true when omitted. */
  required?: boolean;
};

export type HarnessFeatureSprintTaskRiskTier = "tiny" | "standard" | "risky";

export type HarnessFeatureSprintTask = {
  id: string;
  title: string;
  objective: string;
  status: HarnessFeatureSprintTaskStatus;
  acceptanceCriteria: HarnessFeatureSprintTaskAcceptanceCriterion[];
  dependencies: HarnessFeatureSprintDependency[];
  scope: HarnessFeatureSprintTaskScope;
  verificationRequirements: HarnessFeatureSprintTaskVerificationRequirement[];
  completionEvidence?: string[];
  architectureDecisions?: string[];
  gateState?: HarnessFeatureSprintGateState;
  /** Optional bridge to legacy fixed-step / living-spec step id. */
  linkedStepId?: string;
  /** Autonomous-execution risk classification (kernel holds on risky without approval). */
  riskTier?: HarnessFeatureSprintTaskRiskTier;
  /** Frozen clarified-spec revision this task contract is bound to. */
  frozenSpecRevision?: number;
  /** Bounded correction attempts after needs_changes. */
  correctionAttempt?: number;
  maxCorrectionAttempts?: number;
  /** Explicit human approval for risky-task implementation. */
  humanApprovedForRisk?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

/** Schema name: Story. User-facing label: Story / Slice (execution slice). */
export type HarnessFeatureSprintStory = {
  id: string;
  title: string;
  outcome: string;
  tasks: HarnessFeatureSprintTask[];
};

export type HarnessFeatureSprintSprint = {
  id: string;
  title: string;
  objective: string;
  stories: HarnessFeatureSprintStory[];
};

export type HarnessFeatureSprintMap = {
  sprints: HarnessFeatureSprintSprint[];
};

export type HarnessFeatureSprintExecutionTarget = {
  sprintId: string;
  storyId: string;
  taskId: string;
  phase: HarnessFeatureSprintMapPhase;
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
  /** Sprint Map attribution (optional; additive). */
  sprintId?: string;
  storyId?: string;
  taskId?: string;
  mapPhase?: HarnessFeatureSprintMapPhase;
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
  /** Optional runner usability classification (additive; older records omit). */
  terminationReason?: FeatureSprintRunnerTerminationReason;
  failureClass?: FeatureSprintRunnerFailureClass;
  resultUsability?: FeatureSprintRunnerResultUsability;
  timedOut?: boolean;
  cancelled?: boolean;
  diagnosticMessage?: string;
  parseWarnings?: string[];
  stdoutText?: string;
  stderrText?: string;
  /** Informational Cursor/Codex model attribution (additive). */
  requestedModel?: string;
  resolvedModel?: string;
  modelEvidenceSource?: FeatureSprintRunnerModelEvidenceSource;
  worktreeCleanedAt?: string;
  worktreeCleanupStatus?: FeatureSprintWorktreeCleanupStatus;
  worktreeCleanupMessage?: string;
  startedAt: string;
  completedAt?: string;
  importedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Clarified-spec lifecycle for Feature Sprint kernel control plane.
 * Legacy plans without clarifiedSpec remain manual-compatible.
 */
export type HarnessFeatureSprintClarifiedSpecStatus =
  | "draft"
  | "clarifying"
  | "approved"
  | "frozen"
  | "revision_required";

export type HarnessFeatureSprintClarificationQuestionStatus = "open" | "answered" | "waived";

export type HarnessFeatureSprintClarificationQuestion = {
  id: string;
  question: string;
  status: HarnessFeatureSprintClarificationQuestionStatus;
  answer?: string;
  /** When true, open status blocks approve/freeze. Defaults to true. */
  required?: boolean;
};

export type HarnessFeatureSprintClarifiedSpec = {
  revision: number;
  status: HarnessFeatureSprintClarifiedSpecStatus;
  objective: string;
  userIntent: string;
  assumptions: string[];
  constraints: string[];
  nonGoals: string[];
  acceptanceCriteria: string[];
  clarificationQuestions: HarnessFeatureSprintClarificationQuestion[];
  /** Optional risk notes that escalate material-change classification. */
  riskNotes?: string[];
  /** External side effects / schema / auth / deploy flags for material-change rules. */
  sideEffectFlags?: string[];
  approvedAt?: string;
  frozenAt?: string;
  supersedesRevision?: number;
  updatedAt?: string;
};

export type HarnessFeatureSprintAutonomyMode = "manual" | "recommend" | "supervised";

export type HarnessFeatureSprintAutonomyPolicy = {
  mode: HarnessFeatureSprintAutonomyMode;
  autoSaveValidProof: boolean;
  autoImportValidVerdict: boolean;
  autoAdvanceAcceptedTinyTasks: boolean;
  requireHumanForRiskyTasks: boolean;
  requireHumanForSpecFreeze: boolean;
  requireHumanForFinalCompletion: boolean;
  maxCorrectionAttempts: number;
};

export type HarnessFeatureSprintHumanHoldReason =
  | "spec_approval_required"
  | "spec_revision_required"
  | "risky_task_approval_required"
  | "scope_violation"
  | "verification_failed"
  | "review_blocked"
  | "review_conflict"
  | "missing_evidence"
  | "retry_limit_reached"
  | "runner_unavailable"
  | "stale_action"
  | "unsupported_legacy_state"
  | "unfinished_tasks_remain"
  | "dependency_unmet"
  | "task_not_executable";

export type HarnessFeatureSprintLegalAction =
  | "request_clarification"
  | "approve_spec"
  | "freeze_spec"
  | "adopt_sprint_map"
  | "select_task"
  | "launch_localization"
  | "save_localization"
  | "launch_implementation"
  | "save_implementation_proof"
  | "launch_review"
  | "import_review_verdict"
  | "launch_correction"
  | "save_correction_proof"
  | "advance_task"
  | "complete_sprint"
  | "human_hold"
  | "terminal_complete";

export type HarnessFeatureSprintActionAuditResult =
  | "recommended"
  | "applied"
  | "rejected"
  | "held";

export type HarnessFeatureSprintActionAuditEntry = {
  actionId: string;
  action: HarnessFeatureSprintLegalAction | string;
  stateRevisionBefore: number;
  stateRevisionAfter?: number;
  result: HarnessFeatureSprintActionAuditResult;
  reason: string;
  executionContext?: {
    executionModel?: HarnessFeatureSprintExecutionModel;
    sprintId?: string;
    storyId?: string;
    taskId?: string;
    phase?: HarnessFeatureSprintMapPhase;
    frozenSpecRevision?: number;
  };
  specRevision?: number;
  holdReason?: HarnessFeatureSprintHumanHoldReason;
  createdAt: string;
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
  /**
   * Authoritative execution model. Absent means `legacy_steps`.
   * Invariant: a plan has one authoritative execution model at a time.
   */
  executionModel?: HarnessFeatureSprintExecutionModel;
  /** Optional Sprint Map hierarchy (Feature → Sprint → Story/Slice → Task). */
  sprintMap?: HarnessFeatureSprintMap;
  /** Canonical current execution pointer into sprintMap. */
  executionTarget?: HarnessFeatureSprintExecutionTarget;
  /** Actionable Sprint Map normalization / sync notices (not executable state). */
  sprintMapNotices?: HarnessFeatureSprintMapNotice[];
  /**
   * Monotonic workflow revision for stale-action protection.
   * Absent / non-finite values normalize to 0. UI-only display changes must not bump this.
   */
  stateRevision?: number;
  /** Typed clarified specification (optional; legacy plans omit this). */
  clarifiedSpec?: HarnessFeatureSprintClarifiedSpec;
  /** Prior clarified-spec revisions kept for attribution (capped on write). */
  clarifiedSpecHistory?: HarnessFeatureSprintClarifiedSpec[];
  /** Autonomy policy placeholder; default remains manual. */
  autonomyPolicy?: HarnessFeatureSprintAutonomyPolicy;
  /** Recently applied action IDs for idempotent replay detection. */
  appliedActionIds?: string[];
  /** Structured kernel audit trail (capped). */
  actionAuditLog?: HarnessFeatureSprintActionAuditEntry[];
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
