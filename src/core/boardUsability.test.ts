import { describe, expect, it } from "vitest";

import { hasDemoSeedCards, shouldShowDemoTriageBanner, applyDismissDemoTriage } from "./boardUsability";
import { createCleanBootstrapState } from "../data/createSeedState";
import { seedCards } from "../data/seed";
import type { DailyState, LifeCard } from "./types";

describe("boardUsability", () => {
  it("detects demo seed cards", () => {
    expect(hasDemoSeedCards(seedCards)).toBe(true);
    expect(hasDemoSeedCards([])).toBe(false);
  });

  it("shows triage banner for demo board until dismissed", () => {
    const dailyState: DailyState = {
      date: "2026-06-13",
      mode: "normal",
      pounceStarted: false,
      minimumViableDayCompleted: false,
      salvageCompleted: false
    };
    expect(shouldShowDemoTriageBanner(seedCards, dailyState)).toBe(true);
    expect(
      shouldShowDemoTriageBanner(seedCards, applyDismissDemoTriage(dailyState, "2026-06-13T12:00:00.000Z"))
    ).toBe(false);
  });

  it("shows triage when active limit exceeded", () => {
    const cards: LifeCard[] = Array.from({ length: 4 }, (_, index) => ({
      id: `active-${index}`,
      title: `Active ${index}`,
      area: "build" as const,
      state: "active" as const,
      progress: 0,
      warmth: "warm" as const,
      nextTinyAction: "Do thing",
      recentWins: [],
      openLoops: [],
      optimizationIdeas: [],
      proofItemIds: []
    }));

    const dailyState: DailyState = {
      date: "2026-06-13",
      mode: "normal",
      pounceStarted: false,
      minimumViableDayCompleted: false,
      salvageCompleted: false
    };

    expect(shouldShowDemoTriageBanner(cards, dailyState)).toBe(true);
  });
});

describe("createCleanBootstrapState", () => {
  it("starts with empty board and no demo mission", () => {
    const state = createCleanBootstrapState("2026-06-13T12:00:00.000Z");
    expect(state.cards).toEqual([]);
    expect(state.logs).toEqual([]);
    expect(state.proofItems).toEqual([]);
    expect(state.dailyState.mainQuestId).toBeUndefined();
    expect(state.dailyState.pounceMission).toBeUndefined();
  });
});
