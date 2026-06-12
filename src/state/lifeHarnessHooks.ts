import { useMemo } from "react";

import { useLifeHarness } from "./LifeHarnessState";

export function useBoardState() {
  const { cards, logs, proofItems, dailyState } = useLifeHarness();

  return useMemo(
    () => ({ cards, logs, proofItems, dailyState }),
    [cards, logs, proofItems, dailyState]
  );
}

export function useBoardActions() {
  const {
    pounce,
    completeMinimumViableDay,
    completeSalvage,
    submitQuickCapture,
    setCardState
  } = useLifeHarness();

  return useMemo(
    () => ({
      pounce,
      completeMinimumViableDay,
      completeSalvage,
      submitQuickCapture,
      setCardState
    }),
    [pounce, completeMinimumViableDay, completeSalvage, submitQuickCapture, setCardState]
  );
}

export function useCareerState() {
  const { cards, resumeModules, jobCandidates, careerSourcePack } = useLifeHarness();

  return useMemo(
    () => ({ cards, resumeModules, jobCandidates, careerSourcePack }),
    [cards, resumeModules, jobCandidates, careerSourcePack]
  );
}

export function useCareerActions() {
  const {
    submitCareerIntake,
    submitJobCandidateIntake,
    saveJobCandidate,
    dismissJobCandidate,
    approveJobCandidate,
    backfillResumeDraftPacket,
    importCareerSourcePack,
    clearCareerSourcePack
  } = useLifeHarness();

  return useMemo(
    () => ({
      submitCareerIntake,
      submitJobCandidateIntake,
      saveJobCandidate,
      dismissJobCandidate,
      approveJobCandidate,
      backfillResumeDraftPacket,
      importCareerSourcePack,
      clearCareerSourcePack
    }),
    [
      submitCareerIntake,
      submitJobCandidateIntake,
      saveJobCandidate,
      dismissJobCandidate,
      approveJobCandidate,
      backfillResumeDraftPacket,
      importCareerSourcePack,
      clearCareerSourcePack
    ]
  );
}

export function useJobSourcesState() {
  const {
    jobSources,
    jobSourceRuns,
    jobCandidates,
    resumeModules,
    isBatchRunning,
    batchRunProgress
  } = useLifeHarness();

  return useMemo(
    () => ({
      jobSources,
      jobSourceRuns,
      jobCandidates,
      resumeModules,
      isBatchRunning,
      batchRunProgress
    }),
    [jobSources, jobSourceRuns, jobCandidates, resumeModules, isBatchRunning, batchRunProgress]
  );
}

export function useJobSourcesActions() {
  const {
    addJobSource,
    saveJobSourceFromSetup,
    updateJobSource,
    recordJobSourceRun,
    runOneJobSource,
    runDueJobSources,
    runAllEnabledJobSources,
    runFitFinder
  } = useLifeHarness();

  return useMemo(
    () => ({
      addJobSource,
      saveJobSourceFromSetup,
      updateJobSource,
      recordJobSourceRun,
      runOneJobSource,
      runDueJobSources,
      runAllEnabledJobSources,
      runFitFinder
    }),
    [
      addJobSource,
      saveJobSourceFromSetup,
      updateJobSource,
      recordJobSourceRun,
      runOneJobSource,
      runDueJobSources,
      runAllEnabledJobSources,
      runFitFinder
    ]
  );
}

export function useHarnessMemoryState() {
  const { chatSummaries, memoryItems } = useLifeHarness();

  return useMemo(
    () => ({ chatSummaries, memoryItems }),
    [chatSummaries, memoryItems]
  );
}

export function useHarnessMemoryActions() {
  const {
    saveChatSummary,
    deleteChatSummary,
    saveMemoryItem,
    deleteMemoryItem,
    updateMemoryItem,
    toggleMemoryItemActive
  } = useLifeHarness();

  return useMemo(
    () => ({
      saveChatSummary,
      deleteChatSummary,
      saveMemoryItem,
      deleteMemoryItem,
      updateMemoryItem,
      toggleMemoryItemActive
    }),
    [
      saveChatSummary,
      deleteChatSummary,
      saveMemoryItem,
      deleteMemoryItem,
      updateMemoryItem,
      toggleMemoryItemActive
    ]
  );
}

export function useAgentSessionsState() {
  const { cards, projects, agentSessions } = useLifeHarness();

  return useMemo(
    () => ({ cards, projects, agentSessions }),
    [cards, projects, agentSessions]
  );
}

export function useAgentSessionsActions() {
  const {
    saveProjectForCard,
    clearProjectForCard,
    createAgentSessionForCard,
    updateAgentSession,
    completeAgentSession,
    deleteAgentSession
  } = useLifeHarness();

  return useMemo(
    () => ({
      saveProjectForCard,
      clearProjectForCard,
      createAgentSessionForCard,
      updateAgentSession,
      completeAgentSession,
      deleteAgentSession
    }),
    [
      saveProjectForCard,
      clearProjectForCard,
      createAgentSessionForCard,
      updateAgentSession,
      completeAgentSession,
      deleteAgentSession
    ]
  );
}

export function useSnapshotActions() {
  const { persistenceAvailable, exportSnapshot, importSnapshot, resetToSeed } = useLifeHarness();

  return useMemo(
    () => ({ persistenceAvailable, exportSnapshot, importSnapshot, resetToSeed }),
    [persistenceAvailable, exportSnapshot, importSnapshot, resetToSeed]
  );
}
