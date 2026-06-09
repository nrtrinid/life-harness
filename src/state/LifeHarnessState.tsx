import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
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
  type JobSourceRunOutput
} from "../core/jobSourceRunner";
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
}

const LifeHarnessContext = createContext<LifeHarnessContextValue | undefined>(undefined);

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
  const skipInitialSaveRef = useRef(true);
  const persistenceAvailable = localStorageAdapter.isAvailable();

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
      resetToSeed
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
      resetToSeed
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
