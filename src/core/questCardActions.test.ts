import { describe, expect, it } from "vitest";

import {
  getLegacyReachableStates,
  getQuestReachableStates,
  getQuestSecondaryActions,
  getQuestStartAction,
  isQuestDoneAvailable
} from "./questCardActions";
import type { CardState, LifeCard } from "./types";

function makeCard(state: CardState): LifeCard {
  return {
    id: "c1",
    title: "Test card",
    area: "build",
    state,
    progress: 0,
    warmth: "warm",
    nextTinyAction: "Do one thing.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: []
  };
}

describe("getQuestStartAction", () => {
  it("returns Start for inbox, parked, and waiting", () => {
    for (const state of ["inbox", "parked", "waiting"] as const) {
      expect(getQuestStartAction(makeCard(state))).toEqual({ kind: "activate", label: "Start" });
    }
  });

  it("returns Continue for active cards", () => {
    expect(getQuestStartAction(makeCard("active"))).toEqual({ kind: "openDetail", label: "Continue" });
  });

  it("returns hidden for done and killed", () => {
    expect(getQuestStartAction(makeCard("done"))).toEqual({ kind: "hidden", label: "" });
    expect(getQuestStartAction(makeCard("killed"))).toEqual({ kind: "hidden", label: "" });
  });
});

describe("isQuestDoneAvailable", () => {
  it("is false for done and killed", () => {
    expect(isQuestDoneAvailable(makeCard("done"))).toBe(false);
    expect(isQuestDoneAvailable(makeCard("killed"))).toBe(false);
  });

  it("is true for other states", () => {
    for (const state of ["inbox", "active", "parked", "waiting"] as const) {
      expect(isQuestDoneAvailable(makeCard(state))).toBe(true);
    }
  });
});

describe("getQuestSecondaryActions", () => {
  it("includes Reopen for done and killed", () => {
    for (const state of ["done", "killed"] as const) {
      const actions = getQuestSecondaryActions(makeCard(state));
      expect(actions).toContainEqual({ kind: "setState", state: "active", label: "Reopen" });
    }
  });

  it("includes Done in More for killed only", () => {
    expect(getQuestSecondaryActions(makeCard("killed"))).toContainEqual({
      kind: "setState",
      state: "done",
      label: "Done"
    });
    expect(getQuestSecondaryActions(makeCard("done")).some((a) => a.kind === "setState" && a.state === "done")).toBe(
      false
    );
  });

  it("always ends with View detail", () => {
    for (const state of ["inbox", "active", "parked", "waiting", "done", "killed"] as const) {
      const actions = getQuestSecondaryActions(makeCard(state));
      expect(actions.at(-1)).toEqual({ kind: "viewDetail", label: "View detail" });
    }
  });
});

describe("legacy transition parity", () => {
  const states: CardState[] = ["inbox", "active", "parked", "waiting", "done", "killed"];

  it("matches every legacy CardStateButtons target", () => {
    for (const state of states) {
      const card = makeCard(state);
      expect(getQuestReachableStates(card).sort()).toEqual(getLegacyReachableStates(card).sort());
    }
  });
});
