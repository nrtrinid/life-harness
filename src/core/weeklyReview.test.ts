import { describe, expect, it } from "vitest";

import type { LifeHarnessData } from "./actions";
import { buildWeeklyReviewSummary } from "./weeklyReview";
import type { LifeCard, LifeLogEntry, ProofItem } from "./types";

const NOW = "2026-06-09T12:00:00.000Z";

function makeCard(overrides: Partial<LifeCard>): LifeCard {
  return {
    id: "card-1",
    title: "Fitness Return",
    area: "body",
    state: "active",
    progress: 20,
    warmth: "cooling",
    nextTinyAction: "Walk 10 minutes.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    lastTouched: "2026-06-08T12:00:00.000Z",
    ...overrides
  };
}

function baseState(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    cards: [],
    logs: [],
    proofItems: [],
    dailyState: {
      date: "2026-06-09",
      mode: "normal",
      pounceStarted: false,
      minimumViableDayCompleted: false,
      salvageCompleted: false
    },
    resumeModules: [],
    jobCandidates: [],
    jobSources: [],
    jobSourceRuns: [],
    chatSummaries: [],
    memoryItems: [],
    projects: [],
    careerSourcePack: null,
    ...overrides
  };
}

describe("buildWeeklyReviewSummary", () => {
  it("counts logs from last 7 days only", () => {
    const logs: LifeLogEntry[] = [
      {
        id: "recent-pounce",
        timestamp: "2026-06-08T10:00:00.000Z",
        rawText: "pounce",
        area: "build",
        type: "pounce",
        xp: 10
      },
      {
        id: "old-pounce",
        timestamp: "2026-05-01T10:00:00.000Z",
        rawText: "old pounce",
        area: "build",
        type: "pounce",
        xp: 10
      }
    ];
    const proofItems: ProofItem[] = [
      {
        id: "recent-proof",
        timestamp: "2026-06-07T10:00:00.000Z",
        title: "Sent Northrop application"
      },
      {
        id: "old-proof",
        timestamp: "2026-05-01T10:00:00.000Z",
        title: "Old proof"
      }
    ];

    const summary = buildWeeklyReviewSummary(baseState({ logs, proofItems }), NOW);

    expect(summary.pounces).toBe(1);
    expect(summary.proofCount).toBe(1);
    expect(summary.bestProof).toBe("Sent Northrop application");
  });

  it("detects over active limit patch", () => {
    const cards = [
      makeCard({ id: "a" }),
      makeCard({ id: "b", title: "B" }),
      makeCard({ id: "c", title: "C" }),
      makeCard({ id: "d", title: "D" })
    ];

    const summary = buildWeeklyReviewSummary(baseState({ cards }), NOW);

    expect(summary.activeCount).toBe(4);
    expect(summary.activeLimit).toBe(3);
    expect(summary.suggestedPatch).toBe("Park one active card before adding more.");
  });

  it("detects dormant active cards", () => {
    const cards = [
      makeCard({ id: "dormant-1", lastTouched: "2026-05-01T12:00:00.000Z" }),
      makeCard({ id: "dormant-2", title: "Stale Project", lastTouched: "2026-04-01T12:00:00.000Z" })
    ];

    const summary = buildWeeklyReviewSummary(baseState({ cards }), NOW);

    expect(summary.dormantCards).toHaveLength(2);
    expect(summary.suggestedPatch).toBe("Reheat one dormant card or park it to lighten the board.");
  });

  it("picks reasonable suggested patch by priority", () => {
    const overLimit = buildWeeklyReviewSummary(
      baseState({
        cards: [makeCard({ id: "a" }), makeCard({ id: "b", title: "B" }), makeCard({ id: "c", title: "C" }), makeCard({ id: "d", title: "D" })]
      }),
      NOW
    );
    const dormantOnly = buildWeeklyReviewSummary(
      baseState({
        cards: [makeCard({ lastTouched: "2026-05-01T12:00:00.000Z" })]
      }),
      NOW
    );
    const noProof = buildWeeklyReviewSummary(
      baseState({
        cards: [makeCard({})],
        logs: [{ id: "p", timestamp: "2026-06-08T10:00:00.000Z", rawText: "p", area: "build", type: "pounce", xp: 10 }]
      }),
      NOW
    );

    expect(overLimit.suggestedPatch).toContain("Park one");
    expect(dormantOnly.suggestedPatch).toContain("Reheat");
    expect(noProof.suggestedPatch).toContain("proof item");
  });

  it("handles empty logs and cards gracefully", () => {
    const summary = buildWeeklyReviewSummary(baseState(), NOW);

    expect(summary.starts).toBe(0);
    expect(summary.pounces).toBe(0);
    expect(summary.recoveries).toBe(0);
    expect(summary.proofCount).toBe(0);
    expect(summary.dormantCards).toHaveLength(0);
    expect(summary.suggestedPatch).toBe("Log one proof item next week — even a small win counts.");
  });

  it("counts recoveries and clarity starts in window", () => {
    const logs: LifeLogEntry[] = [
      {
        id: "salvage",
        timestamp: "2026-06-08T10:00:00.000Z",
        rawText: "salvage",
        area: "body",
        type: "salvage",
        xp: 30
      },
      {
        id: "clarity",
        timestamp: "2026-06-07T10:00:00.000Z",
        rawText: "planned",
        area: "build",
        type: "clarity",
        xp: 15
      }
    ];

    const summary = buildWeeklyReviewSummary(baseState({ logs }), NOW);

    expect(summary.recoveries).toBe(1);
    expect(summary.starts).toBe(1);
  });
});
