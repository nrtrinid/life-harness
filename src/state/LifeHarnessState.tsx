import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import { Platform } from "react-native";

import {
  applyAddJobSource,
  applyClearCareerSourcePack,
  applyApproveJobCandidate,
  applyBackfillResumeDraftPacket,
  applyCompleteAgentSessionWithEvidence,
  applyImportCareerSourcePack,
  applyCardStateChange,
  applyCareerIntake,
  applyDismissJobCandidate,
  applyJobCandidateIntake,
  applyMvd,
  applyPounce,
  applyQuickCapture,
  applyResumeExportedForCard,
  applyRunJobSourceResult,
  applySalvage,
  applySaveJobCandidate,
  applySaveJobSourceWithOptionalImport,
  applyUpdateJobSource,
  withProofSuffix,
  type JobSourceInput,
  type JobSourcePatch
} from "../core/actions";
import { type CareerIntakeInput } from "../core/career";
import type { LifeHarnessData } from "../core/lifeHarnessData";
import { buildFitFinderResult, type FitFinderResult, type JobCandidateIntakeInput } from "../core/jobScout";
import {
  buildRunAllSummary,
  formatRunBatchNotice,
  getDueJobSources,
  getRunnableJobSources,
  type RunBatchSummary,
  type SourceRunOutcome
} from "../core/jobSourceSchedule";
import {
  buildFetchErrorRunOutput,
  canRunJobSource,
  type JobSourceRunOutput
} from "../core/jobSourceRunner";
import {
  RUNNER_UNREACHABLE_MESSAGE,
  RunnerUnreachableError,
  runSourceViaRunner
} from "../core/jobScoutRunnerClient";
import { startSession } from "../core/briefing";
import {
  applyDeleteChatSummary,
  applySaveChatSummary
} from "../core/harnessMemory";
import {
  applyDeleteMemoryItem,
  applySaveMemoryItem,
  applyToggleMemoryItemActive,
  applyUpdateMemoryItem
} from "../core/harnessMemoryBank";
import {
  applyConfirmedAssistantAction,
  type AssistantProposedAction
} from "../core/assistantActionRegistry";
import {
  applyCreateAgentSessionForCard,
  applyDeleteAgentSession,
  applyUpdateAgentSession,
  type HarnessAgentSessionCompleteInput,
  type HarnessAgentSessionCreateInput,
  type HarnessAgentSessionUpdateInput
} from "../core/agentSessionLog";
import {
  applyAdvanceFeatureSprintStep,
  applyCompleteFeatureSprintPlan,
  applyCreateFeatureSprintPlanForCard,
  applyDeleteFeatureSprintPlan,
  applyUpdateFeatureSprintPlan,
  applyUpdateFeatureSprintStep,
  createFeatureSprintPlanForCard,
  deleteFeatureSprintPlan,
  importFeatureReviewVerdictFromText,
  importFeatureSprintPlanFromText,
  updateFeatureSprintPlan,
  type FeatureSprintPlanCreateInput,
  type FeatureSprintPlanUpdateInput,
  type FeatureSprintStepUpdateInput
} from "../core/featureSprintOrchestrator";
import type { FeatureSprintRunnerResponse, FeatureSprintWorktreeCleanupResponse } from "../core/featureSprintRunner";
import {
  completeFeatureSprintRunnerRun,
  createFeatureSprintRunnerRun,
  markFeatureSprintRunnerRunWorktreeCleanup,
  markMostRecentFeatureSprintRunnerRunImported,
  type FeatureSprintRunnerRunCreateInput,
  type FeatureSprintRunnerRunImportMarkFilter
} from "../core/featureSprintRunnerHistory";
import {
  applyDeleteProjectForCard,
  applyUpsertProjectForCard,
  type HarnessProjectUpsertInput
} from "../core/projectRegistry";
import { nowIso } from "../core/ids";
import { createSeedState } from "../data/createSeedState";
import {
  clearPersistedState,
  loadPersistedState,
  localStorageAdapter,
  parseImportJson,
  savePersistedState,
  serializeEnvelope
} from "../storage/persistence";
import type { CardState, DailyState, HarnessChatSummary, HarnessMemoryItem, JobSource, LifeCard, LifeLogEntry, ProofItem } from "../core/types";

export interface BatchRunProgress {
  current: number;
  total: number;
  sourceName: string;
}

type LifeHarnessAction =
  | { type: "app_session_started" }
  | { type: "pounce" }
  | { type: "mvd_completed" }
  | { type: "salvage_completed"; optionLabel: string }
  | { type: "quick_capture_applied"; state: LifeHarnessData }
  | { type: "card_state_applied"; state: LifeHarnessData }
  | { type: "career_intake_applied"; state: LifeHarnessData }
  | { type: "job_candidate_intake_applied"; state: LifeHarnessData }
  | { type: "job_candidate_updated"; state: LifeHarnessData }
  | { type: "job_source_updated"; state: LifeHarnessData }
  | { type: "save_chat_summary"; summary: HarnessChatSummary }
  | { type: "delete_chat_summary"; summaryId: string }
  | { type: "save_memory_item"; item: HarnessMemoryItem }
  | { type: "delete_memory_item"; itemId: string }
  | { type: "update_memory_item"; item: HarnessMemoryItem }
  | { type: "toggle_memory_item_active"; itemId: string }
  | { type: "save_project"; input: HarnessProjectUpsertInput }
  | { type: "delete_project"; cardId: string }
  | { type: "create_agent_session"; input: HarnessAgentSessionCreateInput }
  | { type: "update_agent_session"; sessionId: string; patch: HarnessAgentSessionUpdateInput }
  | {
      type: "complete_agent_session";
      sessionId: string;
      input: HarnessAgentSessionCompleteInput;
    }
  | { type: "delete_agent_session"; sessionId: string }
  | { type: "create_feature_sprint_plan"; input: FeatureSprintPlanCreateInput }
  | { type: "update_feature_sprint_plan"; planId: string; patch: FeatureSprintPlanUpdateInput }
  | {
      type: "update_feature_sprint_step";
      planId: string;
      stepId: string;
      patch: FeatureSprintStepUpdateInput;
    }
  | { type: "advance_feature_sprint_step"; planId: string; stepId: string }
  | {
      type: "complete_feature_sprint_plan";
      planId: string;
      input?: { proofText?: string };
    }
  | { type: "delete_feature_sprint_plan"; planId: string }
  | { type: "state_replaced"; state: LifeHarnessData };

interface LifeHarnessContextValue extends LifeHarnessData {
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
  logResumeExportForCard: (
    cardId: string,
    options?: { filename?: string }
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

const LifeHarnessContext = createContext<LifeHarnessContextValue | undefined>(undefined);

function patchSourceRunning(state: LifeHarnessData, sourceId: string): LifeHarnessData {
  return {
    ...state,
    jobSources: state.jobSources.map((source) =>
      source.id === sourceId
        ? { ...source, runStatus: "running" as const, lastRunMessage: "Running..." }
        : source
    )
  };
}

function outcomeFromRun(source: JobSource, result: ReturnType<typeof applyRunJobSourceResult>): SourceRunOutcome {
  const run = result.state.jobSourceRuns[0];
  return {
    sourceId: source.id,
    sourceName: source.name,
    ok: result.ok,
    createdCandidates: run?.createdCandidateIds.length ?? 0,
    skippedDuplicates: run?.skippedDuplicates ?? 0,
    errors: run?.errors ?? [],
    message: result.message ?? run?.message ?? "Source run recorded."
  };
}

function createInitialState(): LifeHarnessData {
  const loaded = loadPersistedState();
  if (loaded) {
    return {
      ...loaded,
      dailyState: startSession(loaded.dailyState, nowIso())
    };
  }
  return createSeedState(nowIso());
}

function lifeHarnessReducer(state: LifeHarnessData, action: LifeHarnessAction): LifeHarnessData {
  switch (action.type) {
    case "app_session_started":
      return {
        ...state,
        dailyState: startSession(state.dailyState, nowIso())
      };
    case "pounce": {
      const result = applyPounce(state);
      return result.ok ? result.state : state;
    }
    case "mvd_completed": {
      const result = applyMvd(state);
      return result.ok ? result.state : state;
    }
    case "salvage_completed": {
      const result = applySalvage(state, action.optionLabel);
      return result.ok ? result.state : state;
    }
    case "quick_capture_applied":
      return action.state;
    case "card_state_applied":
      return action.state;
    case "career_intake_applied":
      return action.state;
    case "job_candidate_intake_applied":
    case "job_candidate_updated":
    case "job_source_updated":
    case "state_replaced":
      return action.state;
    case "save_chat_summary":
      return applySaveChatSummary(state, action.summary);
    case "delete_chat_summary":
      return applyDeleteChatSummary(state, action.summaryId);
    case "save_memory_item":
      return applySaveMemoryItem(state, action.item);
    case "delete_memory_item":
      return applyDeleteMemoryItem(state, action.itemId);
    case "update_memory_item":
      return applyUpdateMemoryItem(state, action.item);
    case "toggle_memory_item_active":
      return applyToggleMemoryItemActive(state, action.itemId);
    case "save_project": {
      const result = applyUpsertProjectForCard(state, action.input);
      return result.ok ? result.state : state;
    }
    case "delete_project":
      return applyDeleteProjectForCard(state, action.cardId);
    case "create_agent_session": {
      const result = applyCreateAgentSessionForCard(state, action.input);
      return result.ok ? result.state : state;
    }
    case "update_agent_session": {
      const result = applyUpdateAgentSession(state, action.sessionId, action.patch);
      return result.ok ? result.state : state;
    }
    case "complete_agent_session":
      return applyCompleteAgentSessionWithEvidence(state, action.sessionId, action.input).state;
    case "delete_agent_session":
      return applyDeleteAgentSession(state, action.sessionId);
    case "create_feature_sprint_plan":
      return applyCreateFeatureSprintPlanForCard(state, action.input);
    case "update_feature_sprint_plan":
      return applyUpdateFeatureSprintPlan(state, action.planId, action.patch);
    case "update_feature_sprint_step":
      return applyUpdateFeatureSprintStep(
        state,
        action.planId,
        action.stepId,
        action.patch
      );
    case "advance_feature_sprint_step":
      return applyAdvanceFeatureSprintStep(state, action.planId, action.stepId);
    case "complete_feature_sprint_plan":
      return applyCompleteFeatureSprintPlan(state, action.planId, action.input);
    case "delete_feature_sprint_plan":
      return applyDeleteFeatureSprintPlan(state, action.planId);
    default:
      return state;
  }
}

function downloadJsonOnWeb(json: string): boolean {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return false;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `life-harness-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

export function LifeHarnessProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(lifeHarnessReducer, undefined, createInitialState);
  const stateRef = useRef(state);
  const skipInitialSaveRef = useRef(true);
  const persistenceAvailable = localStorageAdapter.isAvailable();
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchRunProgress, setBatchRunProgress] = useState<BatchRunProgress | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }
    const timer = setTimeout(() => savePersistedState(state), 300);
    return () => clearTimeout(timer);
  }, [state]);

  const pounce = useCallback(() => {
    if (state.dailyState.pounceStarted) {
      return { ok: false, message: "Pounce already logged this session." };
    }
    dispatch({ type: "pounce" });
    return { ok: true, message: withProofSuffix("+10 XP · Career pounce logged", true) };
  }, [state.dailyState.pounceStarted]);

  const completeMinimumViableDay = useCallback(() => {
    if (state.dailyState.minimumViableDayCompleted) {
      return { ok: false, message: "Minimum viable day already logged this session." };
    }
    dispatch({ type: "mvd_completed" });
    return { ok: true, message: withProofSuffix("+30 XP · Day preserved", true) };
  }, [state.dailyState.minimumViableDayCompleted]);

  const completeSalvage = useCallback(
    (optionLabel: string) => {
      if (state.dailyState.salvageCompleted) {
        return { ok: false, message: "Salvage already logged this session." };
      }
      dispatch({ type: "salvage_completed", optionLabel });
      return { ok: true, message: withProofSuffix("+30 XP · Salvage logged", true) };
    },
    [state.dailyState.salvageCompleted]
  );

  const submitQuickCapture = useCallback(
    (rawText: string) => {
      const result = applyQuickCapture(state, rawText);
      if (result.ok) {
        dispatch({ type: "quick_capture_applied", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const submitCareerIntake = useCallback(
    (input: CareerIntakeInput) => {
      const result = applyCareerIntake(state, input);
      if (result.ok) {
        dispatch({ type: "career_intake_applied", state: result.state });
        return { ok: true, message: result.message, cardId: result.cardId };
      }
      return { ok: false, message: result.message };
    },
    [state]
  );

  const submitJobCandidateIntake = useCallback(
    (input: JobCandidateIntakeInput) => {
      const result = applyJobCandidateIntake(state, input);
      if (result.ok) {
        dispatch({ type: "job_candidate_intake_applied", state: result.state });
        return { ok: true, message: result.message, candidateId: result.candidateId };
      }
      return { ok: false, message: result.message };
    },
    [state]
  );

  const saveJobCandidateAction = useCallback(
    (candidateId: string) => {
      const result = applySaveJobCandidate(state, candidateId);
      if (result.ok) {
        dispatch({ type: "job_candidate_updated", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const dismissJobCandidateAction = useCallback(
    (candidateId: string) => {
      const result = applyDismissJobCandidate(state, candidateId);
      if (result.ok) {
        dispatch({ type: "job_candidate_updated", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const approveJobCandidateAction = useCallback(
    (candidateId: string) => {
      const result = applyApproveJobCandidate(state, candidateId);
      if (result.ok) {
        dispatch({ type: "job_candidate_updated", state: result.state });
        return {
          ok: true,
          message: result.message,
          cardId: result.cardId,
          candidateId: result.candidateId
        };
      }
      return { ok: false, message: result.message };
    },
    [state]
  );

  const backfillResumeDraftPacketAction = useCallback(
    (cardId: string) => {
      const result = applyBackfillResumeDraftPacket(state, cardId);
      if (result.ok) {
        dispatch({ type: "career_intake_applied", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const importCareerSourcePack = useCallback(
    (json: string) => {
      const result = applyImportCareerSourcePack(state, json);
      if (result.ok) {
        dispatch({ type: "state_replaced", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const clearCareerSourcePack = useCallback(
    () => {
      const result = applyClearCareerSourcePack(state);
      if (result.ok) {
        dispatch({ type: "state_replaced", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const addJobSourceAction = useCallback(
    (input: JobSourceInput) => {
      const result = applyAddJobSource(state, input);
      if (result.ok) {
        dispatch({ type: "job_source_updated", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const saveJobSourceFromSetup = useCallback(
    (input: JobSourceInput, previewOutput?: JobSourceRunOutput, importPreview?: boolean) => {
      const result =
        importPreview && previewOutput
          ? applySaveJobSourceWithOptionalImport(state, input, previewOutput)
          : applyAddJobSource(state, input);
      if (result.ok) {
        dispatch({ type: "job_source_updated", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const updateJobSourceAction = useCallback(
    (sourceId: string, patch: JobSourcePatch) => {
      const result = applyUpdateJobSource(state, sourceId, patch);
      if (result.ok) {
        dispatch({ type: "job_source_updated", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const recordJobSourceRunAction = useCallback(
    (source: JobSource, output: JobSourceRunOutput) => {
      const result = applyRunJobSourceResult(state, output);
      dispatch({ type: "job_source_updated", state: result.state });
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const setCardState = useCallback(
    (cardId: string, newState: CardState) => {
      const result = applyCardStateChange(state, cardId, newState);
      if (result.ok) {
        dispatch({ type: "card_state_applied", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    [state]
  );

  const exportSnapshot = useCallback(() => {
    const json = serializeEnvelope(state);
    const downloaded = downloadJsonOnWeb(json);
    if (downloaded) {
      return { ok: true, message: "Snapshot downloaded." };
    }
    return {
      ok: true,
      message: persistenceAvailable
        ? "Snapshot ready (download not supported on this platform)."
        : "Snapshot JSON prepared (local persistence unavailable on this platform)."
    };
  }, [state, persistenceAvailable]);

  const importSnapshot = useCallback((json: string) => {
    const result = parseImportJson(json);
    if (!result.ok || !result.data) {
      return { ok: false, message: result.error ?? "Import failed." };
    }
    dispatch({ type: "state_replaced", state: result.data });
    return { ok: true, message: "Snapshot imported." };
  }, []);

  const resetToSeed = useCallback(() => {
    clearPersistedState();
    dispatch({ type: "state_replaced", state: createSeedState(nowIso()) });
    return { ok: true, message: "Restored seed state." };
  }, []);

  const saveChatSummary = useCallback((summary: HarnessChatSummary) => {
    dispatch({ type: "save_chat_summary", summary });
  }, []);

  const deleteChatSummary = useCallback((summaryId: string) => {
    dispatch({ type: "delete_chat_summary", summaryId });
  }, []);

  const saveMemoryItem = useCallback((item: HarnessMemoryItem) => {
    dispatch({ type: "save_memory_item", item });
  }, []);

  const deleteMemoryItem = useCallback((itemId: string) => {
    dispatch({ type: "delete_memory_item", itemId });
  }, []);

  const updateMemoryItem = useCallback((item: HarnessMemoryItem) => {
    dispatch({ type: "update_memory_item", item });
  }, []);

  const toggleMemoryItemActive = useCallback((itemId: string) => {
    dispatch({ type: "toggle_memory_item_active", itemId });
  }, []);

  const saveProjectForCard = useCallback((input: HarnessProjectUpsertInput) => {
    const card = stateRef.current.cards.find((item) => item.id === input.cardId);
    if (!card) {
      return { ok: false, message: `Card not found: ${input.cardId}` };
    }
    dispatch({ type: "save_project", input });
    return { ok: true, message: "Project metadata saved." };
  }, []);

  const clearProjectForCard = useCallback((cardId: string) => {
    dispatch({ type: "delete_project", cardId });
    return { ok: true, message: "Project metadata cleared." };
  }, []);

  const createAgentSessionForCard = useCallback((input: HarnessAgentSessionCreateInput) => {
    const card = stateRef.current.cards.find((item) => item.id === input.cardId);
    if (!card) {
      return { ok: false, message: `Card not found: ${input.cardId}` };
    }
    const result = applyCreateAgentSessionForCard(stateRef.current, input);
    if (!result.ok) {
      return { ok: false, message: result.error };
    }
    dispatch({ type: "state_replaced", state: result.state });
    return { ok: true, message: "Agent session saved.", sessionId: result.sessionId };
  }, []);

  const updateAgentSession = useCallback(
    (sessionId: string, patch: HarnessAgentSessionUpdateInput) => {
      const existing = stateRef.current.agentSessions.find((session) => session.id === sessionId);
      if (!existing) {
        return { ok: false, message: "Session not found." };
      }
      const result = applyUpdateAgentSession(stateRef.current, sessionId, patch);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Agent session updated." };
    },
    []
  );

  const completeAgentSession = useCallback(
    (sessionId: string, input: HarnessAgentSessionCompleteInput = {}) => {
      const existing = stateRef.current.agentSessions.find((session) => session.id === sessionId);
      if (!existing) {
        return { ok: false, message: "Session not found." };
      }
      const result = applyCompleteAgentSessionWithEvidence(stateRef.current, sessionId, input);
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: result.ok, message: result.message };
    },
    []
  );

  const logResumeExportForCard = useCallback(
    (cardId: string, options?: { filename?: string }) => {
      const result = applyResumeExportedForCard(stateRef.current, cardId, options);
      if (result.ok) {
        dispatch({ type: "state_replaced", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },
    []
  );

  const deleteAgentSession = useCallback((sessionId: string) => {
    const existing = stateRef.current.agentSessions.find((session) => session.id === sessionId);
    if (!existing) {
      return { ok: false, message: "Session not found." };
    }
    dispatch({ type: "delete_agent_session", sessionId });
    return { ok: true, message: "Agent session deleted." };
  }, []);

  const createFeatureSprintPlanForCardAction = useCallback(
    (input: FeatureSprintPlanCreateInput) => {
      const result = createFeatureSprintPlanForCard(stateRef.current, input);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Feature sprint plan created.", planId: result.planId };
    },
    []
  );

  const updateFeatureSprintPlanAction = useCallback(
    (planId: string, patch: FeatureSprintPlanUpdateInput) => {
      const result = updateFeatureSprintPlan(stateRef.current, planId, patch);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Feature sprint plan updated." };
    },
    []
  );

  const updateFeatureSprintStepAction = useCallback(
    (planId: string, stepId: string, patch: FeatureSprintStepUpdateInput) => {
      const existing = stateRef.current.featureSprintPlans.find((plan) => plan.id === planId);
      if (!existing) {
        return { ok: false, message: "Plan not found." };
      }
      dispatch({ type: "update_feature_sprint_step", planId, stepId, patch });
      return { ok: true, message: "Feature sprint step updated." };
    },
    []
  );

  const advanceFeatureSprintStepAction = useCallback((planId: string, stepId: string) => {
    const existing = stateRef.current.featureSprintPlans.find((plan) => plan.id === planId);
    if (!existing) {
      return { ok: false, message: "Plan not found." };
    }
    dispatch({ type: "advance_feature_sprint_step", planId, stepId });
    return { ok: true, message: "Feature sprint step advanced." };
  }, []);

  const completeFeatureSprintPlanAction = useCallback(
    (planId: string, input?: { proofText?: string }) => {
      const existing = stateRef.current.featureSprintPlans.find((plan) => plan.id === planId);
      if (!existing) {
        return { ok: false, message: "Plan not found." };
      }
      const hadEvidence = !!(existing.evidenceLogId || existing.evidenceProofItemId);
      dispatch({ type: "complete_feature_sprint_plan", planId, input });
      return {
        ok: true,
        message: hadEvidence ? "Feature sprint marked complete." : "Feature sprint complete · Proof updated."
      };
    },
    []
  );

  const deleteFeatureSprintPlanAction = useCallback((planId: string) => {
    const result = deleteFeatureSprintPlan(stateRef.current, planId);
    if (!result.ok) {
      return { ok: false, message: result.error };
    }
    dispatch({ type: "state_replaced", state: result.state });
    return { ok: true, message: "Feature sprint plan deleted." };
  }, []);

  const importFeatureSprintPlanForCardAction = useCallback((cardId: string, text: string) => {
    const result = importFeatureSprintPlanFromText(stateRef.current, cardId, text);
    if (!result.ok) {
      return { ok: false, message: result.error };
    }
    dispatch({ type: "state_replaced", state: result.state });
    return { ok: true, message: "Feature sprint plan imported.", planId: result.planId };
  }, []);

  const importFeatureReviewVerdictForPlanAction = useCallback(
    (planId: string, text: string, stepId?: string) => {
      const result = importFeatureReviewVerdictFromText(
        stateRef.current,
        planId,
        text,
        stepId
      );
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Review verdict imported." };
    },
    []
  );

  const createFeatureSprintRunnerRunAction = useCallback(
    (input: FeatureSprintRunnerRunCreateInput) => {
      const result = createFeatureSprintRunnerRun(stateRef.current, input);
      if (!result.ok) {
        return { ok: false, message: result.error, safetyBlocked: result.safetyBlocked };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Runner history started.", runId: result.runId };
    },
    []
  );

  const completeFeatureSprintRunnerRunAction = useCallback(
    (runId: string, response: FeatureSprintRunnerResponse) => {
      const result = completeFeatureSprintRunnerRun(stateRef.current, runId, response);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Runner history updated." };
    },
    []
  );

  const markMostRecentFeatureSprintRunnerRunImportedAction = useCallback(
    (filter: FeatureSprintRunnerRunImportMarkFilter) => {
      const result = markMostRecentFeatureSprintRunnerRunImported(stateRef.current, filter);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      if (result.runId) {
        dispatch({ type: "state_replaced", state: result.state });
      }
      return {
        ok: true,
        message: result.runId ? "Runner output marked imported." : "No matching runner run to mark.",
        runId: result.runId
      };
    },
    []
  );

  const markFeatureSprintRunnerRunWorktreeCleanupAction = useCallback(
    (runId: string, response: FeatureSprintWorktreeCleanupResponse) => {
      const result = markFeatureSprintRunnerRunWorktreeCleanup(stateRef.current, runId, response);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: response.message };
    },
    []
  );

  const confirmAssistantAction = useCallback((action: AssistantProposedAction) => {
    const result = applyConfirmedAssistantAction(stateRef.current, action);
    if (!result.ok) {
      return { ok: false, message: result.error };
    }
    dispatch({ type: "state_replaced", state: result.data });
    return { ok: true, message: result.message };
  }, []);

  const runSourceOnState = useCallback(
    async (current: LifeHarnessData, source: JobSource): Promise<{
      state: LifeHarnessData;
      outcome: SourceRunOutcome;
      runnerUnreachable: boolean;
    }> => {
      let next = patchSourceRunning(current, source.id);
      dispatch({ type: "state_replaced", state: next });

      try {
        const output = await runSourceViaRunner({
          source,
          existingCandidates: next.jobCandidates,
          resumeModules: next.resumeModules
        });
        const result = applyRunJobSourceResult(next, output);
        next = result.state;
        dispatch({ type: "state_replaced", state: next });
        return {
          state: next,
          outcome: outcomeFromRun(source, result),
          runnerUnreachable: false
        };
      } catch (error) {
        const message =
          error instanceof RunnerUnreachableError
            ? RUNNER_UNREACHABLE_MESSAGE
            : "Local Job Scout Runner request failed.";
        const result = applyRunJobSourceResult(next, buildFetchErrorRunOutput(source, message));
        next = result.state;
        dispatch({ type: "state_replaced", state: next });
        return {
          state: next,
          outcome: {
            ...outcomeFromRun(source, result),
            runnerUnreachable: error instanceof RunnerUnreachableError
          },
          runnerUnreachable: error instanceof RunnerUnreachableError
        };
      }
    },
    []
  );

  const runOneJobSource = useCallback(
    async (sourceId: string) => {
      const current = stateRef.current;
      const source = current.jobSources.find((item) => item.id === sourceId);
      if (!source) {
        return { ok: false, message: "Source not found." };
      }

      const guard = canRunJobSource(source);
      if (!guard.ok) {
        return { ok: false, message: guard.reason ?? "Cannot run source." };
      }

      const { outcome, runnerUnreachable } = await runSourceOnState(current, source);
      return {
        ok: outcome.ok,
        message: outcome.message,
        outcome,
        runnerUnreachable
      };
    },
    [runSourceOnState]
  );

  const runSourceBatch = useCallback(
    async (targets: JobSource[]): Promise<RunBatchSummary> => {
      const outcomes: SourceRunOutcome[] = [];
      setIsBatchRunning(true);

      try {
        for (let index = 0; index < targets.length; index += 1) {
          const source = targets[index];
          setBatchRunProgress({
            current: index + 1,
            total: targets.length,
            sourceName: source.name
          });

          const { outcome, runnerUnreachable } = await runSourceOnState(stateRef.current, source);
          outcomes.push(outcome);

          if (runnerUnreachable) {
            break;
          }
        }
      } finally {
        setBatchRunProgress(null);
        setIsBatchRunning(false);
      }

      return buildRunAllSummary(outcomes);
    },
    [runSourceOnState]
  );

  const runDueJobSources = useCallback(async () => {
    const targets = getDueJobSources(stateRef.current.jobSources, new Date());
    if (targets.length === 0) {
      return {
        ok: true,
        message: "No due sources to run.",
        summary: buildRunAllSummary([])
      };
    }

    const summary = await runSourceBatch(targets);
    return {
      ok: summary.failedSources === 0 && !summary.runnerUnreachable,
      message: formatRunBatchNotice(summary),
      summary
    };
  }, [runSourceBatch]);

  const runAllEnabledJobSources = useCallback(async () => {
    const targets = getRunnableJobSources(stateRef.current.jobSources);
    if (targets.length === 0) {
      return {
        ok: true,
        message: "No enabled runnable sources.",
        summary: buildRunAllSummary([])
      };
    }

    const summary = await runSourceBatch(targets);
    return {
      ok: summary.failedSources === 0 && !summary.runnerUnreachable,
      message: formatRunBatchNotice(summary),
      summary
    };
  }, [runSourceBatch]);

  const runFitFinder = useCallback(async (): Promise<FitFinderResult> => {
    const targets = getRunnableJobSources(stateRef.current.jobSources);
    if (targets.length === 0) {
      return buildFitFinderResult({
        ok: false,
        createdCandidates: [],
        skippedDuplicates: 0,
        noSourcesMessage: "Add a source first, or paste a job post to score it."
      });
    }

    const beforeIds = new Set(stateRef.current.jobCandidates.map((c) => c.id));
    const summary = await runSourceBatch(targets);

    if (summary.runnerUnreachable) {
      return buildFitFinderResult({
        ok: false,
        runnerUnreachable: true,
        createdCandidates: [],
        skippedDuplicates: summary.skippedDuplicates,
        errors: summary.errors,
        runnerMessage: RUNNER_UNREACHABLE_MESSAGE
      });
    }

    const afterCandidates = stateRef.current.jobCandidates;
    const createdCandidates = afterCandidates.filter((c) => !beforeIds.has(c.id));

    return buildFitFinderResult({
      ok: summary.failedSources === 0,
      createdCandidates,
      skippedDuplicates: summary.skippedDuplicates,
      errors: summary.errors
    });
  }, [runSourceBatch]);

  const value = useMemo(
    () => ({
      ...state,
      persistenceAvailable,
      pounce,
      completeMinimumViableDay,
      completeSalvage,
      submitQuickCapture,
      submitCareerIntake,
      submitJobCandidateIntake,
      saveJobCandidate: saveJobCandidateAction,
      dismissJobCandidate: dismissJobCandidateAction,
      approveJobCandidate: approveJobCandidateAction,
      backfillResumeDraftPacket: backfillResumeDraftPacketAction,
      importCareerSourcePack,
      clearCareerSourcePack,
      addJobSource: addJobSourceAction,
      saveJobSourceFromSetup,
      updateJobSource: updateJobSourceAction,
      recordJobSourceRun: recordJobSourceRunAction,
      setCardState,
      exportSnapshot,
      importSnapshot,
      resetToSeed,
      saveChatSummary,
      deleteChatSummary,
      saveMemoryItem,
      deleteMemoryItem,
      updateMemoryItem,
      toggleMemoryItemActive,
      saveProjectForCard,
      clearProjectForCard,
      createAgentSessionForCard,
      updateAgentSession,
      completeAgentSession,
      logResumeExportForCard,
      deleteAgentSession,
      createFeatureSprintPlanForCard: createFeatureSprintPlanForCardAction,
      updateFeatureSprintPlan: updateFeatureSprintPlanAction,
      updateFeatureSprintStep: updateFeatureSprintStepAction,
      advanceFeatureSprintStep: advanceFeatureSprintStepAction,
      completeFeatureSprintPlan: completeFeatureSprintPlanAction,
      deleteFeatureSprintPlan: deleteFeatureSprintPlanAction,
      importFeatureSprintPlanForCard: importFeatureSprintPlanForCardAction,
      importFeatureReviewVerdictForPlan: importFeatureReviewVerdictForPlanAction,
      createFeatureSprintRunnerRun: createFeatureSprintRunnerRunAction,
      completeFeatureSprintRunnerRun: completeFeatureSprintRunnerRunAction,
      markMostRecentFeatureSprintRunnerRunImported:
        markMostRecentFeatureSprintRunnerRunImportedAction,
      markFeatureSprintRunnerRunWorktreeCleanup:
        markFeatureSprintRunnerRunWorktreeCleanupAction,
      confirmAssistantAction,
      isBatchRunning,
      batchRunProgress,
      runOneJobSource,
      runDueJobSources,
      runAllEnabledJobSources,
      runFitFinder
    }),
    [
      state,
      persistenceAvailable,
      pounce,
      completeMinimumViableDay,
      completeSalvage,
      submitQuickCapture,
      submitCareerIntake,
      submitJobCandidateIntake,
      saveJobCandidateAction,
      dismissJobCandidateAction,
      approveJobCandidateAction,
      backfillResumeDraftPacketAction,
      importCareerSourcePack,
      clearCareerSourcePack,
      addJobSourceAction,
      saveJobSourceFromSetup,
      updateJobSourceAction,
      recordJobSourceRunAction,
      setCardState,
      exportSnapshot,
      importSnapshot,
      resetToSeed,
      saveChatSummary,
      deleteChatSummary,
      saveMemoryItem,
      deleteMemoryItem,
      updateMemoryItem,
      toggleMemoryItemActive,
      saveProjectForCard,
      clearProjectForCard,
      createAgentSessionForCard,
      updateAgentSession,
      completeAgentSession,
      logResumeExportForCard,
      deleteAgentSession,
      createFeatureSprintPlanForCardAction,
      updateFeatureSprintPlanAction,
      updateFeatureSprintStepAction,
      advanceFeatureSprintStepAction,
      completeFeatureSprintPlanAction,
      deleteFeatureSprintPlanAction,
      importFeatureSprintPlanForCardAction,
      importFeatureReviewVerdictForPlanAction,
      createFeatureSprintRunnerRunAction,
      completeFeatureSprintRunnerRunAction,
      markMostRecentFeatureSprintRunnerRunImportedAction,
      markFeatureSprintRunnerRunWorktreeCleanupAction,
      confirmAssistantAction,
      isBatchRunning,
      batchRunProgress,
      runOneJobSource,
      runDueJobSources,
      runAllEnabledJobSources,
      runFitFinder
    ]
  );

  return <LifeHarnessContext.Provider value={value}>{children}</LifeHarnessContext.Provider>;
}

export function useLifeHarness() {
  const context = useContext(LifeHarnessContext);

  if (!context) {
    throw new Error("useLifeHarness must be used inside LifeHarnessProvider");
  }

  return context;
}

export type { LifeCard, LifeLogEntry, ProofItem, DailyState };
