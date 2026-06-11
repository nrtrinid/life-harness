import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import type { LifeHarnessData } from "./actions";
import {
  buildAgentWorkbenchSummary,
  classifyAgentWorkbenchSession,
  countInFlightAgentSessionsForCard,
  sessionHasAgentResult
} from "./agentWorkbench";
import type { HarnessAgentSession, LifeCard } from "./types";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";

function fixtureCard(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: "card-build-test",
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Add agent workbench.",
    doneForNow: "Workbench drafted.",
    doLane: "Wire workbench screen.",
    improveLane: "Do not add execution bridge.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    ...overrides
  };
}

function fixtureSession(overrides: Partial<HarnessAgentSession> = {}): HarnessAgentSession {
  return {
    id: "session-1",
    cardId: "card-build-test",
    agent: "codex",
    status: "sent",
    taskName: "Work on Momentum Board v0.1",
    goal: "Add agent workbench.",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides
  };
}

function baseData(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW),
    ...overrides
  };
}

describe("agentWorkbench helpers", () => {
  it("sessionHasAgentResult detects result-bearing fields", () => {
    expect(sessionHasAgentResult(fixtureSession())).toBe(false);
    expect(sessionHasAgentResult(fixtureSession({ resultSummary: "Shipped." }))).toBe(true);
    expect(sessionHasAgentResult(fixtureSession({ verificationResult: "pass" }))).toBe(true);
    expect(sessionHasAgentResult(fixtureSession({ commitHash: "abc123" }))).toBe(true);
    expect(sessionHasAgentResult(fixtureSession({ filesChanged: ["src/core/agentWorkbench.ts"] }))).toBe(
      true
    );
  });

  it("classifies sessions into buckets", () => {
    expect(classifyAgentWorkbenchSession(fixtureSession({ status: "sent" }))).toBe("inMotion");
    expect(
      classifyAgentWorkbenchSession(fixtureSession({ status: "sent", resultSummary: "Done." }))
    ).toBe("needsReview");
    expect(classifyAgentWorkbenchSession(fixtureSession({ status: "reviewing" }))).toBe("needsReview");
    expect(classifyAgentWorkbenchSession(fixtureSession({ status: "planned" }))).toBe("inMotion");
    expect(classifyAgentWorkbenchSession(fixtureSession({ status: "done" }))).toBe("recentlyCompleted");
    expect(classifyAgentWorkbenchSession(fixtureSession({ status: "parked" }))).toBe(null);
  });
});

describe("buildAgentWorkbenchSummary", () => {
  it("returns empty sections for empty data", () => {
    const summary = buildAgentWorkbenchSummary(
      baseData({ cards: [], agentSessions: [], projects: [] })
    );

    expect(summary.needsReview).toEqual([]);
    expect(summary.inMotion).toEqual([]);
    expect(summary.recentlyCompleted).toEqual([]);
    expect(summary.readyToDelegate).toEqual([]);
  });

  it("puts sent session without result in inMotion", () => {
    const card = fixtureCard();
    const summary = buildAgentWorkbenchSummary(
      baseData({
        cards: [card],
        agentSessions: [fixtureSession({ status: "sent" })]
      })
    );

    expect(summary.inMotion).toHaveLength(1);
    expect(summary.inMotion[0]?.taskName).toBe("Work on Momentum Board v0.1");
    expect(summary.needsReview).toEqual([]);
  });

  it("puts reviewing and result-bearing sent sessions in needsReview", () => {
    const card = fixtureCard();
    const summary = buildAgentWorkbenchSummary(
      baseData({
        cards: [card],
        agentSessions: [
          fixtureSession({ id: "s-review", status: "reviewing" }),
          fixtureSession({ id: "s-sent-result", status: "sent", resultSummary: "Ready for review." })
        ]
      })
    );

    expect(summary.needsReview).toHaveLength(2);
    expect(summary.inMotion).toEqual([]);
  });

  it("puts done sessions in recentlyCompleted newest first and respects cap", () => {
    const card = fixtureCard();
    const summary = buildAgentWorkbenchSummary(
      baseData({
        cards: [card],
        agentSessions: [
          fixtureSession({
            id: "older",
            status: "done",
            updatedAt: "2026-06-01T12:00:00.000Z",
            completedAt: "2026-06-01T12:00:00.000Z"
          }),
          fixtureSession({
            id: "newer",
            status: "done",
            updatedAt: "2026-06-08T12:00:00.000Z",
            completedAt: "2026-06-08T12:00:00.000Z"
          })
        ]
      }),
      { completedLimit: 1 }
    );

    expect(summary.recentlyCompleted).toHaveLength(1);
    expect(summary.recentlyCompleted[0]?.sessionId).toBe("newer");
  });

  it("includes project-backed active build cards in readyToDelegate", () => {
    const card = fixtureCard();
    const summary = buildAgentWorkbenchSummary(
      baseData({
        cards: [card],
        projects: [
          {
            id: "project-1",
            cardId: card.id,
            name: "Life Harness",
            repoPath: "C:/Users/me/Projects/life-harness",
            verificationCommands: ["npm test"],
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW
          }
        ]
      })
    );

    expect(summary.readyToDelegate).toHaveLength(1);
    expect(summary.readyToDelegate[0]?.cardId).toBe(card.id);
    expect(summary.readyToDelegate[0]?.hasVerificationCommands).toBe(true);
  });

  it("excludes cards without project metadata from readyToDelegate", () => {
    const card = fixtureCard();
    const summary = buildAgentWorkbenchSummary(baseData({ cards: [card], projects: [] }));

    expect(summary.readyToDelegate).toEqual([]);
  });

  it("excludes project-backed cards with in-flight sessions from readyToDelegate", () => {
    const card = fixtureCard();
    const data = baseData({
      cards: [card],
      projects: [
        {
          id: "project-1",
          cardId: card.id,
          name: "Life Harness",
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW
        }
      ],
      agentSessions: [fixtureSession({ status: "sent" })]
    });

    expect(countInFlightAgentSessionsForCard(data, card.id)).toBe(1);
    expect(buildAgentWorkbenchSummary(data).readyToDelegate).toEqual([]);
  });

  it("does not mix unrelated card and session data", () => {
    const cardA = fixtureCard({ id: "card-a", title: "Card A" });
    const cardB = fixtureCard({ id: "card-b", title: "Card B", state: "parked" });
    const summary = buildAgentWorkbenchSummary(
      baseData({
        cards: [cardA, cardB],
        agentSessions: [fixtureSession({ cardId: "card-a", status: "sent" })]
      })
    );

    expect(summary.inMotion).toHaveLength(1);
    expect(summary.inMotion[0]?.cardTitle).toBe("Card A");
    expect(summary.readyToDelegate).toEqual([]);
  });

  it("excludes S3 cards and their sessions", () => {
    const s3Card = fixtureCard({ id: "card-s3", sensitivity: "S3" });
    const summary = buildAgentWorkbenchSummary(
      baseData({
        cards: [s3Card],
        agentSessions: [fixtureSession({ cardId: "card-s3", status: "sent" })]
      })
    );

    expect(summary.inMotion).toEqual([]);
    expect(summary.needsReview).toEqual([]);
    expect(summary.readyToDelegate).toEqual([]);
  });

  it("sorts in-motion sessions by updatedAt newest first", () => {
    const card = fixtureCard();
    const summary = buildAgentWorkbenchSummary(
      baseData({
        cards: [card],
        agentSessions: [
          fixtureSession({
            id: "older",
            status: "planned",
            updatedAt: "2026-06-01T12:00:00.000Z"
          }),
          fixtureSession({
            id: "newer",
            status: "sent",
            updatedAt: "2026-06-08T12:00:00.000Z"
          })
        ]
      })
    );

    expect(summary.inMotion.map((row) => row.sessionId)).toEqual(["newer", "older"]);
  });
});
