import type { CareerIntakeInput } from "../../core/career";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import type { FitFinderResult, JobCandidateIntakeInput } from "../../core/jobScout";
import type {
  HarnessAgentSessionCompleteInput,
  HarnessAgentSessionCreateInput,
  HarnessAgentSessionUpdateInput
} from "../../core/agentSessionLog";
import type { AssistantProposedAction } from "../../core/assistantActionRegistry";
import type {
  FeatureSprintPlanCreateInput,
  FeatureSprintPlanUpdateInput,
  FeatureSprintStepUpdateInput
} from "../../core/featureSprintOrchestrator";
import type {
  FeatureSprintRunnerResponse,
  FeatureSprintWorktreeCleanupResponse
} from "../../core/featureSprintRunner";
import type {
  FeatureSprintRunnerRunCreateInput,
  FeatureSprintRunnerRunImportMarkFilter
} from "../../core/featureSprintRunnerHistory";
import type { JobSourceInput, JobSourcePatch } from "../../core/actions";
import type { JobSourceRunOutput } from "../../core/jobSourceRunner";
import type { RunBatchSummary, SourceRunOutcome } from "../../core/jobSourceSchedule";
import type { HarnessProjectUpsertInput } from "../../core/projectRegistry";
import type {
  CardState,
  DailyState,
  HarnessChatSummary,
  HarnessMemoryItem,
  JobSource,
  LifeCard,
  LifeLogEntry,
  ProofItem
} from "../../core/types";

export interface BatchRunProgress {
  current: number;
  total: number;
  sourceName: string;
}

export interface LifeHarnessContextValue extends LifeHarnessData {
  persistenceAvailable: boolean;
  pounce: () => { ok: boolean; message?: string };
  completeMinimumViableDay: () => { ok: boolean; message?: string };
  completeSalvage: (optionLabel: string) => { ok: boolean; message?: string };
  submitQuickCapture: (rawText: string) => { ok: boolean; message?: string };
  submitCareerIntake: (input: CareerIntakeInput) => { ok: boolean; message?: string; cardId?: string };
  submitJobCandidateIntake: (
    input: JobCandidateIntakeInput
  ) => { ok: boolean; message?: string; candidateId?: string };
  saveJobCandidate: (candidateId: string) => { ok: boolean; message?: string };
  dismissJobCandidate: (candidateId: string) => { ok: boolean; message?: string };
  approveJobCandidate: (
    candidateId: string
  ) => { ok: boolean; message?: string; cardId?: string; candidateId?: string };
  backfillResumeDraftPacket: (cardId: string) => { ok: boolean; message?: string };
  importCareerSourcePack: (json: string) => { ok: boolean; message?: string };
  clearCareerSourcePack: () => { ok: boolean; message?: string };
  addJobSource: (input: JobSourceInput) => { ok: boolean; message?: string };
  saveJobSourceFromSetup: (
    input: JobSourceInput,
    previewOutput?: JobSourceRunOutput,
    importPreview?: boolean
  ) => { ok: boolean; message?: string };
  updateJobSource: (sourceId: string, patch: JobSourcePatch) => { ok: boolean; message?: string };
  recordJobSourceRun: (
    source: JobSource,
    output: JobSourceRunOutput
  ) => { ok: boolean; message?: string };
  setCardState: (cardId: string, state: CardState) => { ok: boolean; message?: string };
  logResumeExportForCard: (
    cardId: string,
    options?: { filename?: string }
  ) => { ok: boolean; message?: string };
  exportSnapshot: () => { ok: boolean; message?: string };
  importSnapshot: (json: string) => { ok: boolean; message?: string };
  resetToSeed: () => { ok: boolean; message?: string };
  saveChatSummary: (summary: HarnessChatSummary) => void;
  deleteChatSummary: (summaryId: string) => void;
  saveMemoryItem: (item: HarnessMemoryItem) => void;
  deleteMemoryItem: (itemId: string) => void;
  updateMemoryItem: (item: HarnessMemoryItem) => void;
  toggleMemoryItemActive: (itemId: string) => void;
  saveProjectForCard: (input: HarnessProjectUpsertInput) => { ok: boolean; message?: string };
  clearProjectForCard: (cardId: string) => { ok: boolean; message?: string };
  createAgentSessionForCard: (
    input: HarnessAgentSessionCreateInput
  ) => { ok: boolean; message?: string; sessionId?: string };
  updateAgentSession: (
    sessionId: string,
    patch: HarnessAgentSessionUpdateInput
  ) => { ok: boolean; message?: string };
  completeAgentSession: (
    sessionId: string,
    input?: HarnessAgentSessionCompleteInput
  ) => { ok: boolean; message?: string };
  deleteAgentSession: (sessionId: string) => { ok: boolean; message?: string };
  createFeatureSprintPlanForCard: (
    input: FeatureSprintPlanCreateInput
  ) => { ok: boolean; message?: string; planId?: string };
  updateFeatureSprintPlan: (
    planId: string,
    patch: FeatureSprintPlanUpdateInput
  ) => { ok: boolean; message?: string };
  updateFeatureSprintStep: (
    planId: string,
    stepId: string,
    patch: FeatureSprintStepUpdateInput
  ) => { ok: boolean; message?: string };
  advanceFeatureSprintStep: (
    planId: string,
    stepId: string
  ) => { ok: boolean; message?: string };
  completeFeatureSprintPlan: (
    planId: string,
    input?: { proofText?: string }
  ) => { ok: boolean; message?: string };
  deleteFeatureSprintPlan: (planId: string) => { ok: boolean; message?: string };
  importFeatureSprintPlanForCard: (
    cardId: string,
    text: string
  ) => { ok: boolean; message?: string; planId?: string };
  importFeatureReviewVerdictForPlan: (
    planId: string,
    text: string,
    stepId?: string
  ) => { ok: boolean; message?: string };
  createFeatureSprintRunnerRun: (
    input: FeatureSprintRunnerRunCreateInput
  ) => { ok: boolean; message?: string; runId?: string; safetyBlocked?: boolean };
  completeFeatureSprintRunnerRun: (
    runId: string,
    response: FeatureSprintRunnerResponse
  ) => { ok: boolean; message?: string };
  markMostRecentFeatureSprintRunnerRunImported: (
    filter: FeatureSprintRunnerRunImportMarkFilter
  ) => { ok: boolean; message?: string; runId?: string };
  markFeatureSprintRunnerRunWorktreeCleanup: (
    runId: string,
    response: FeatureSprintWorktreeCleanupResponse
  ) => { ok: boolean; message?: string };
  confirmAssistantAction: (
    action: AssistantProposedAction
  ) => { ok: boolean; message?: string };
  isBatchRunning: boolean;
  batchRunProgress: BatchRunProgress | null;
  runOneJobSource: (
    sourceId: string
  ) => Promise<{ ok: boolean; message?: string; outcome?: SourceRunOutcome; runnerUnreachable?: boolean }>;
  runDueJobSources: () => Promise<{ ok: boolean; message: string; summary: RunBatchSummary }>;
  runAllEnabledJobSources: () => Promise<{ ok: boolean; message: string; summary: RunBatchSummary }>;
  runFitFinder: () => Promise<FitFinderResult>;
}

export type { LifeCard, LifeLogEntry, ProofItem, DailyState };
