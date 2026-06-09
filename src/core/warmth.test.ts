import { describe, expect, it } from "vitest";

import type { LifeCard } from "./types";
import {
  computeCardWarmth,
  computeWarmthFromAge,
  shouldFlagAsNeglected,
  isTerminalState
} from "./warmth";

function makeCard(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: "test",
    title: "Test",
    area: "build",
    state: "active",
    progress: 0,
    warmth: "hot",
    nextTinyAction: "Do thing",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    ...overrides
  };
}

const NOW = new Date("2026-06-09T12:00:00.000Z");

describe("computeWarmthFromAge", () => {
  it("maps threshold boundaries", () => {
    expect(computeWarmthFromAge(0.5)).toBe("hot");
    expect(computeWarmthFromAge(2)).toBe("warm");
    expect(computeWarmthFromAge(5)).toBe("cooling");
    expect(computeWarmthFromAge(10)).toBe("cold");
    expect(computeWarmthFromAge(20)).toBe("dormant");
  });
});

describe("computeCardWarmth", () => {
  it("returns dormant when never touched", () => {
    const card = makeCard({ lastTouched: undefined });
    expect(computeCardWarmth(card, [], NOW)).toBe("dormant");
  });

  it("uses latest linked log timestamp", () => {
    const card = makeCard({
      id: "c1",
      lastTouched: "2026-06-01T12:00:00.000Z"
    });
    const logs = [
      {
        id: "l1",
        timestamp: "2026-06-09T10:00:00.000Z",
        rawText: "win",
        area: "build" as const,
        cardId: "c1",
        type: "win" as const,
        xp: 15
      }
    ];
    expect(computeCardWarmth(card, logs, NOW)).toBe("hot");
  });
});

describe("neglect helpers", () => {
  it("excludes done/killed from neglect flags", () => {
    expect(isTerminalState("done")).toBe(true);
    expect(shouldFlagAsNeglected(makeCard({ state: "done", warmth: "cold" }), "cold")).toBe(false);
    expect(shouldFlagAsNeglected(makeCard({ state: "killed" }), "dormant")).toBe(false);
  });

  it("flags active cold/dormant as neglected", () => {
    expect(shouldFlagAsNeglected(makeCard({ state: "active" }), "cold")).toBe(true);
    expect(shouldFlagAsNeglected(makeCard({ state: "parked" }), "cold")).toBe(false);
  });
});
