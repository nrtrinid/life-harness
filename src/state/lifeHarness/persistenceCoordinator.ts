import type { LifeHarnessData } from "../../core/lifeHarnessData";
import { savePersistedState } from "../../storage/persistence";
import type { StorageAdapter } from "../../storage/types";
import { localStorageAdapter } from "../../storage/localStorageAdapter";

export const LIFE_HARNESS_AUTOSAVE_DEBOUNCE_MS = 300;

export type LifeHarnessPersistenceCoordinator = {
  /** Monotonic generation of the latest intended persisted state. */
  getGeneration: () => number;
  /** Latest state intended for disk (kept in sync with app stateRef). */
  getLatestState: () => LifeHarnessData;
  setLatestState: (state: LifeHarnessData) => void;
  /** Cancel any pending debounced autosave. */
  cancelPendingAutosave: () => void;
  /**
   * Schedule a debounced autosave for the current latest state.
   * Timers capture a generation; stale timers no-op.
   */
  scheduleAutosave: (delayMs?: number) => void;
  /**
   * Synchronously persist `state`, bump generation, cancel pending autosave,
   * and update the latest-state pointer. Returns false if the write fails.
   */
  flushSync: (state: LifeHarnessData) => boolean;
  /** Test helper: fire the pending autosave timer immediately (if any). */
  flushPendingAutosaveForTests: () => void;
  /** Test helper: whether an autosave timer is armed. */
  hasPendingAutosaveForTests: () => boolean;
};

export type CreateLifeHarnessPersistenceCoordinatorOptions = {
  getLatestState: () => LifeHarnessData;
  setLatestState: (state: LifeHarnessData) => void;
  adapter?: StorageAdapter;
  save?: (data: LifeHarnessData, adapter?: StorageAdapter) => boolean;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

/**
 * Coordinates durable sync flushes vs debounced autosave so a stale timer
 * cannot overwrite a newer synchronous claim/response persist.
 */
export function createLifeHarnessPersistenceCoordinator(
  options: CreateLifeHarnessPersistenceCoordinatorOptions
): LifeHarnessPersistenceCoordinator {
  const adapter = options.adapter ?? localStorageAdapter;
  const save = options.save ?? savePersistedState;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

  let generation = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingGeneration: number | null = null;

  const cancelPendingAutosave = () => {
    if (pendingTimer !== null) {
      clearTimeoutFn(pendingTimer);
      pendingTimer = null;
      pendingGeneration = null;
    }
  };

  const runAutosaveIfCurrent = (scheduledGeneration: number) => {
    pendingTimer = null;
    pendingGeneration = null;
    if (scheduledGeneration !== generation) {
      return;
    }
    save(options.getLatestState(), adapter);
  };

  return {
    getGeneration: () => generation,
    getLatestState: () => options.getLatestState(),
    setLatestState: (state) => options.setLatestState(state),
    cancelPendingAutosave,
    scheduleAutosave: (delayMs = LIFE_HARNESS_AUTOSAVE_DEBOUNCE_MS) => {
      cancelPendingAutosave();
      const scheduledGeneration = generation;
      pendingGeneration = scheduledGeneration;
      pendingTimer = setTimeoutFn(() => {
        runAutosaveIfCurrent(scheduledGeneration);
      }, delayMs);
    },
    flushSync: (state) => {
      cancelPendingAutosave();
      generation += 1;
      options.setLatestState(state);
      const ok = save(state, adapter);
      if (!ok) {
        // Keep generation advanced so a stale pre-flush timer cannot write older state.
        return false;
      }
      return true;
    },
    flushPendingAutosaveForTests: () => {
      if (pendingTimer === null || pendingGeneration === null) {
        return;
      }
      const scheduledGeneration = pendingGeneration;
      clearTimeoutFn(pendingTimer);
      runAutosaveIfCurrent(scheduledGeneration);
    },
    hasPendingAutosaveForTests: () => pendingTimer !== null
  };
}
