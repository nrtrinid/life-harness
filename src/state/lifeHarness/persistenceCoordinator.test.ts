import { describe, expect, it, vi } from "vitest";

import type { LifeHarnessData } from "../../core/lifeHarnessData";
import { createCleanBootstrapState } from "../../data/createSeedState";
import { claimFeatureSprintExecutionAttempt } from "../../core/featureSprintExecutionAttempt";
import { createLifeHarnessPersistenceCoordinator } from "./persistenceCoordinator";
import type { StorageAdapter } from "../../storage/types";

function memoryAdapter(store: { raw: string | null }): StorageAdapter {
  return {
    isAvailable: () => true,
    loadRaw: () => store.raw,
    saveRaw: (json) => {
      store.raw = json;
    },
    clear: () => {
      store.raw = null;
    }
  };
}

describe("createLifeHarnessPersistenceCoordinator", () => {
  it("does not let a stale autosave overwrite a durable claim flush", () => {
    const store = { raw: null as string | null };
    const adapter = memoryAdapter(store);
    let latest = createCleanBootstrapState();

    const timers: Array<{ fn: () => void; gen: number }> = [];
    const coordinator = createLifeHarnessPersistenceCoordinator({
      getLatestState: () => latest,
      setLatestState: (state) => {
        latest = state;
      },
      adapter,
      setTimeoutFn: ((fn: () => void) => {
        const handle = { fn, gen: -1 };
        timers.push(handle);
        return handle as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeoutFn: ((handle: unknown) => {
        const idx = timers.indexOf(handle as { fn: () => void; gen: number });
        if (idx >= 0) {
          timers.splice(idx, 1);
        }
      }) as typeof clearTimeout
    });

    // 1) Old state schedules autosave.
    coordinator.setLatestState(latest);
    coordinator.scheduleAutosave(300);
    expect(timers).toHaveLength(1);
    const staleTimer = timers[0]!;

    // 2) Durable claim synchronously persists newer state.
    const claimed = claimFeatureSprintExecutionAttempt(latest, {
      planId: "plan-1",
      actionId: "action-1",
      stateRevision: 1,
      profile: "codex_implementation",
      cardId: "card-1",
      stepId: "step-1"
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }
    const flushed = coordinator.flushSync(claimed.state);
    expect(flushed).toBe(true);
    expect(coordinator.hasPendingAutosaveForTests()).toBe(false);

    // 3) Allow the old timer callback to run (simulating late fire after cancel race).
    // Even if something invokes the captured callback, generation guard must no-op.
    staleTimer.fn();

    // 4) Persisted state still contains the durable claim.
    expect(store.raw).toBeTruthy();
    const parsed = JSON.parse(store.raw!) as { data: LifeHarnessData };
    expect(parsed.data.featureSprintExecutionAttempts?.[0]?.attemptId).toBe(
      claimed.attempt.attemptId
    );
    expect(parsed.data.featureSprintExecutionAttempts?.[0]?.status).toBe("claimed");
  });

  it("autosave writes latest stateRef contents, not a stale closure snapshot", () => {
    const writes: LifeHarnessData[] = [];
    let latest = createCleanBootstrapState();
    const coordinator = createLifeHarnessPersistenceCoordinator({
      getLatestState: () => latest,
      setLatestState: (state) => {
        latest = state;
      },
      save: (data) => {
        writes.push(data);
        return true;
      },
      setTimeoutFn: ((fn: () => void) => {
        // Fire immediately for the test.
        fn();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeoutFn: vi.fn() as unknown as typeof clearTimeout
    });

    const claimed = claimFeatureSprintExecutionAttempt(latest, {
      planId: "plan-2",
      actionId: "action-2",
      stateRevision: 2,
      profile: "codex_implementation"
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }
    latest = claimed.state;
    coordinator.scheduleAutosave(0);
    expect(writes.at(-1)?.featureSprintExecutionAttempts?.[0]?.attemptId).toBe(
      claimed.attempt.attemptId
    );
  });
});
