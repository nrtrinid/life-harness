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
  applyApproveJobCandidate,
  applyCardStateChange,
  applyCareerIntake,
  applyDismissJobCandidate,
  applyJobCandidateIntake,
  applyMvd,
  applyPounce,
  applyQuickCapture,
  applyRunJobSourceResult,
  applySalvage,
  applySaveJobCandidate,
  applyUpdateJobSource,
  withProofSuffix,
  type JobSourceInput,
  type JobSourcePatch,
  type LifeHarnessData
} from "../core/actions";
import { type CareerIntakeInput } from "../core/career";
import { type JobCandidateIntakeInput } from "../core/jobScout";
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
import type { CardState, DailyState, JobSource, LifeCard, LifeLogEntry, ProofItem } from "../core/types";

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
  addJobSource: (input: JobSourceInput) => { ok: boolean; message?: string };
  updateJobSource: (sourceId: string, patch: JobSourcePatch) => { ok: boolean; message?: string };
  recordJobSourceRun: (
    source: JobSource,
    output: JobSourceRunOutput
  ) => { ok: boolean; message?: string };
  setCardState: (cardId: string, state: CardState) => { ok: boolean; message?: string };
  exportSnapshot: () => { ok: boolean; message?: string };
  importSnapshot: (json: string) => { ok: boolean; message?: string };
  resetToSeed: () => { ok: boolean; message?: string };
  isBatchRunning: boolean;
  batchRunProgress: BatchRunProgress | null;
  runOneJobSource: (
    sourceId: string
  ) => Promise<{ ok: boolean; message?: string; outcome?: SourceRunOutcome; runnerUnreachable?: boolean }>;
  runDueJobSources: () => Promise<{ ok: boolean; message: string; summary: RunBatchSummary }>;
  runAllEnabledJobSources: () => Promise<{ ok: boolean; message: string; summary: RunBatchSummary }>;
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
    dispatch({ type: "app_session_started" });
  }, []);

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
      addJobSource: addJobSourceAction,
      updateJobSource: updateJobSourceAction,
      recordJobSourceRun: recordJobSourceRunAction,
      setCardState,
      exportSnapshot,
      importSnapshot,
      resetToSeed,
      isBatchRunning,
      batchRunProgress,
      runOneJobSource,
      runDueJobSources,
      runAllEnabledJobSources
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
      addJobSourceAction,
      updateJobSourceAction,
      recordJobSourceRunAction,
      setCardState,
      exportSnapshot,
      importSnapshot,
      resetToSeed,
      isBatchRunning,
      batchRunProgress,
      runOneJobSource,
      runDueJobSources,
      runAllEnabledJobSources
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
