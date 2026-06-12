import { describe, expect, it } from "vitest";

import { applyQuickCapture } from "../../core/actions";
import { createSeedState } from "../../data/createSeedState";
import type { LifeHarnessAction } from "./actions";
import { lifeHarnessReducer } from "./rootReducer";

function reduceAll(state: ReturnType<typeof createSeedState>, actions: LifeHarnessAction[]) {
  return actions.reduce((next, action) => lifeHarnessReducer(next, action), state);
}

describe("lifeHarnessReducer domain delegation", () => {
  const seed = createSeedState("2026-06-11T12:00:00.000Z");

  it("handles board quick capture through boardReducer", () => {
    const capture = applyQuickCapture(seed, "new idea: domain split test");
    expect(capture.ok).toBe(true);
    if (!capture.ok) {
      return;
    }

    const next = lifeHarnessReducer(seed, {
      type: "quick_capture_applied",
      state: capture.state
    });

    expect(next.cards.length).toBeGreaterThan(seed.cards.length);
    expect(next.cards.some((card) => card.title.includes("domain split test"))).toBe(true);
  });

  it("rejects duplicate pounce without mutating state", () => {
    const once = lifeHarnessReducer(seed, { type: "pounce" });
    const twice = lifeHarnessReducer(once, { type: "pounce" });

    expect(once.dailyState.pounceStarted).toBe(true);
    expect(twice).toBe(once);
  });

  it("passes career snapshot actions through careerReducer", () => {
    const replaced = {
      ...seed,
      jobCandidates: []
    };

    const next = lifeHarnessReducer(seed, {
      type: "job_candidate_updated",
      state: replaced
    });

    expect(next.jobCandidates).toEqual([]);
  });

  it("replaces full state for state_replaced", () => {
    const replaced = {
      ...seed,
      logs: []
    };

    const next = lifeHarnessReducer(seed, { type: "state_replaced", state: replaced });
    expect(next.logs).toEqual([]);
  });

  it("preserves state for unknown action types", () => {
    const next = lifeHarnessReducer(seed, { type: "not_a_real_action" } as unknown as LifeHarnessAction);
    expect(next).toBe(seed);
  });

  it("chains board then harness actions without losing prior mutations", () => {
    const next = reduceAll(seed, [
      { type: "pounce" },
      {
        type: "save_memory_item",
        item: {
          id: "memory-test",
          kind: "pattern",
          title: "Boundary test",
          summary: "Reducer parity",
          tags: ["test"],
          createdAt: "2026-06-11T12:00:00.000Z",
          updatedAt: "2026-06-11T12:00:00.000Z",
          isActive: true
        }
      }
    ]);

    expect(next.dailyState.pounceStarted).toBe(true);
    expect(next.memoryItems.some((item) => item.id === "memory-test")).toBe(true);
  });
});
