import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import type { LifeHarnessData } from "./lifeHarnessData";
import { buildProofLedger } from "./proofLedger";
import { PROOF_TITLES } from "./proof";
import type { HarnessAgentSession, LifeCard, LifeLogEntry, ProofItem } from "./types";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";

function baseData(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW),
    ...overrides
  };
}

function fixtureCard(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: "card-build-test",
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    nextTinyAction: "Ship proof ledger.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    ...overrides
  };
}

describe("buildProofLedger", () => {
  it("returns a safe summary for empty evidence", () => {
    const summary = buildProofLedger(
      baseData({
        proofItems: [],
        logs: [],
        agentSessions: []
      })
    );

    expect(summary.entries).toEqual([]);
    expect(summary.recent).toEqual([]);
    expect(summary.totalProof).toBe(0);
    expect(summary.bySource.proof).toBe(0);
  });

  it("includes proof items as ledger entries", () => {
    const card = fixtureCard();
    const proof: ProofItem = {
      id: "proof-1",
      timestamp: "2026-06-09T11:00:00.000Z",
      title: PROOF_TITLES.pounce,
      area: "social_career",
      cardId: card.id,
      sourceLogId: "log-pounce"
    };

    const summary = buildProofLedger(
      baseData({
        cards: [card],
        proofItems: [proof],
        logs: [
          {
            id: "log-pounce",
            timestamp: "2026-06-09T11:00:00.000Z",
            rawText: "Started career pounce",
            area: "social_career",
            type: "pounce",
            xp: 10,
            cardId: card.id,
            proofItemId: proof.id
          }
        ]
      })
    );

    expect(summary.entries.some((entry) => entry.proofItemId === "proof-1")).toBe(true);
    expect(summary.entries.find((entry) => entry.proofItemId === "proof-1")?.source).toBe("recovery");
    expect(summary.totalProof).toBe(1);
  });

  it("includes log-only meaningful events", () => {
    const summary = buildProofLedger(
      baseData({
        proofItems: [],
        logs: [
          {
            id: "log-career",
            timestamp: "2026-06-09T10:00:00.000Z",
            rawText: "Added job candidate: Acme — Engineer",
            area: "social_career",
            type: "clarity",
            xp: 5
          }
        ]
      })
    );

    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].id).toBe("log-log-career");
    expect(summary.entries[0].source).toBe("career");
  });

  it("dedupes proof/log pairs via sourceLogId", () => {
    const card = fixtureCard();
    const proof: ProofItem = {
      id: "proof-pair",
      timestamp: "2026-06-09T12:00:00.000Z",
      title: PROOF_TITLES.mvd,
      area: "body",
      sourceLogId: "log-mvd"
    };
    const log: LifeLogEntry = {
      id: "log-mvd",
      timestamp: "2026-06-09T12:00:00.000Z",
      rawText: "Completed minimum viable day",
      area: "body",
      type: "mvd",
      xp: 30,
      proofItemId: proof.id
    };

    const summary = buildProofLedger(
      baseData({
        cards: [card],
        proofItems: [proof],
        logs: [log]
      })
    );

    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].proofItemId).toBe("proof-pair");
  });

  it("does not double count completed agent sessions with evidence proof", () => {
    const card = fixtureCard();
    const proof: ProofItem = {
      id: "proof-agent",
      timestamp: "2026-06-09T13:00:00.000Z",
      title: "Agent session: Wire proof ledger",
      area: "build",
      cardId: card.id,
      sourceLogId: "log-agent"
    };
    const session: HarnessAgentSession = {
      id: "session-done",
      cardId: card.id,
      agent: "codex",
      status: "done",
      taskName: "Wire proof ledger",
      goal: "Ship ledger.",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      completedAt: "2026-06-09T13:00:00.000Z",
      evidenceProofItemId: proof.id,
      evidenceLogId: "log-agent"
    };

    const summary = buildProofLedger(
      baseData({
        cards: [card],
        proofItems: [proof],
        logs: [
          {
            id: "log-agent",
            timestamp: "2026-06-09T13:00:00.000Z",
            rawText: "Agent session: Wire proof ledger",
            area: "build",
            type: "win",
            xp: 10,
            cardId: card.id,
            proofItemId: proof.id
          }
        ],
        agentSessions: [session]
      })
    );

    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].source).toBe("agent");
  });

  it("includes fallback agent entry when done session has no evidence proof", () => {
    const card = fixtureCard();
    const session: HarnessAgentSession = {
      id: "session-fallback",
      cardId: card.id,
      agent: "cursor",
      status: "done",
      taskName: "Fallback session",
      goal: "Finish task.",
      resultSummary: "Shipped ledger screen.",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      completedAt: "2026-06-09T14:00:00.000Z"
    };

    const summary = buildProofLedger(
      baseData({
        cards: [card],
        proofItems: [],
        logs: [],
        agentSessions: [session]
      })
    );

    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].agentSessionId).toBe("session-fallback");
    expect(summary.entries[0].source).toBe("agent");
  });

  it("sorts entries newest first", () => {
    const summary = buildProofLedger(
      baseData({
        proofItems: [
          {
            id: "proof-old",
            timestamp: "2026-06-08T10:00:00.000Z",
            title: PROOF_TITLES.salvage
          },
          {
            id: "proof-new",
            timestamp: "2026-06-09T10:00:00.000Z",
            title: PROOF_TITLES.idea
          }
        ],
        logs: []
      })
    );

    expect(summary.entries[0].proofItemId).toBe("proof-new");
    expect(summary.entries[1].proofItemId).toBe("proof-old");
  });

  it("filters by cardId", () => {
    const cardA = fixtureCard({ id: "card-a", title: "Card A" });
    const cardB = fixtureCard({ id: "card-b", title: "Card B" });

    const summary = buildProofLedger(
      baseData({
        cards: [cardA, cardB],
        proofItems: [
          {
            id: "proof-a",
            timestamp: FIXED_NOW,
            title: "Worked on Card A.",
            cardId: "card-a"
          },
          {
            id: "proof-b",
            timestamp: FIXED_NOW,
            title: "Worked on Card B.",
            cardId: "card-b"
          }
        ],
        logs: []
      }),
      { cardId: "card-a" }
    );

    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].cardId).toBe("card-a");
  });

  it("excludes S3 card entries", () => {
    const s3Card = fixtureCard({ id: "card-s3", sensitivity: "S3" });
    const summary = buildProofLedger(
      baseData({
        cards: [s3Card],
        proofItems: [
          {
            id: "proof-s3",
            timestamp: FIXED_NOW,
            title: "Secret win",
            cardId: "card-s3"
          }
        ],
        logs: []
      })
    );

    expect(summary.entries).toHaveLength(0);
  });

  it("returns deterministic bySource counts", () => {
    const card = fixtureCard();
    const summary = buildProofLedger(
      baseData({
        cards: [card],
        proofItems: [
          {
            id: "proof-recovery",
            timestamp: "2026-06-09T09:00:00.000Z",
            title: PROOF_TITLES.mvd
          },
          {
            id: "proof-career",
            timestamp: "2026-06-09T10:00:00.000Z",
            title: PROOF_TITLES.appliedToJob,
            area: "social_career",
            cardId: card.id
          }
        ],
        logs: [
          {
            id: "log-only",
            timestamp: "2026-06-09T08:00:00.000Z",
            rawText: "Added job candidate",
            area: "social_career",
            type: "clarity",
            xp: 5
          }
        ]
      })
    );

    expect(summary.bySource.recovery).toBe(1);
    expect(summary.bySource.career).toBe(2);
    expect(summary.entries.length).toBe(3);
  });

  it("caps recent to eight entries", () => {
    const proofItems: ProofItem[] = Array.from({ length: 12 }, (_, index) => ({
      id: `proof-${index}`,
      timestamp: `2026-06-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      title: `Proof ${index}`
    }));

    const summary = buildProofLedger(
      baseData({
        proofItems,
        logs: []
      })
    );

    expect(summary.entries.length).toBe(12);
    expect(summary.recent.length).toBe(8);
  });

  it("returns safe summary for seed data", () => {
    const summary = buildProofLedger(createSeedState(FIXED_NOW));
    expect(summary.entries.length).toBeGreaterThanOrEqual(0);
    expect(summary.recent.length).toBeLessThanOrEqual(8);
  });
});
