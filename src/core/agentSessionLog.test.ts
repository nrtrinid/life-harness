import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { applyCompleteAgentSessionWithEvidence } from "./actions";
import type { LifeHarnessData } from "./lifeHarnessData";
import {
  buildAgentSessionProofSummary,
  completeAgentSession,
  createAgentSessionForCard,
  deleteAgentSession,
  getAgentSessionsForCard,
  getRecentAgentSessions,
  sessionAlreadyHasEvidence,
  updateAgentSession
} from "./agentSessionLog";
import { normalizeData } from "./stateHydration";
import type { LifeCard } from "./types";

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
    nextTinyAction: "Add agent session log.",
    doneForNow: "Session log drafted.",
    doLane: "Wire card detail editor.",
    improveLane: "Do not add execution bridge.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    ...overrides
  };
}

function baseData(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW),
    ...overrides
  };
}

describe("agentSessionLog", () => {
  it("normalizes missing agentSessions to an empty array", () => {
    const normalized = normalizeData({
      cards: [],
      logs: [],
      proofItems: [],
      dailyState: createSeedState(FIXED_NOW).dailyState,
      resumeModules: [],
      jobCandidates: [],
      jobSources: [],
      jobSourceRuns: [],
      chatSummaries: [],
      memoryItems: [],
      projects: []
    });

    expect(normalized.agentSessions).toEqual([]);
  });

  it("creates a session for a card with defaults and optional projectId", () => {
    const card = fixtureCard();
    const data = baseData({
      cards: [card],
      projects: [
        {
          id: "project-1",
          cardId: card.id,
          name: card.title,
          verificationCommands: ["npm test -- agentSessionLog"],
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW
        }
      ]
    });

    const created = createAgentSessionForCard(
      data,
      { cardId: card.id, resultSummary: "Shipped session log." },
      FIXED_NOW
    );

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const session = getAgentSessionsForCard(created.state, card.id)[0];
    expect(session?.agent).toBe("codex");
    expect(session?.status).toBe("sent");
    expect(session?.taskName).toBe("Work on Momentum Board v0.1");
    expect(session?.goal).toBe("Add agent session log.");
    expect(session?.projectId).toBe("project-1");
    expect(session?.verificationCommands).toEqual(["npm test -- agentSessionLog"]);
    expect(session?.resultSummary).toBe("Shipped session log.");
  });

  it("updates a session", () => {
    const card = fixtureCard();
    const created = createAgentSessionForCard(baseData({ cards: [card] }), { cardId: card.id }, FIXED_NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const updated = updateAgentSession(
      created.state,
      created.sessionId,
      { resultSummary: "Updated result." },
      FIXED_NOW
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    const session = getAgentSessionsForCard(updated.state, card.id)[0];
    expect(session?.resultSummary).toBe("Updated result.");
  });

  it("completes a session as done with result fields", () => {
    const card = fixtureCard();
    const created = createAgentSessionForCard(baseData({ cards: [card] }), { cardId: card.id }, FIXED_NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const completed = completeAgentSession(
      created.state,
      created.sessionId,
      { resultSummary: "All tests pass.", commitHash: "abc1234" },
      FIXED_NOW
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    const session = getAgentSessionsForCard(completed.state, card.id)[0];
    expect(session?.status).toBe("done");
    expect(session?.completedAt).toBe(FIXED_NOW);
    expect(session?.resultSummary).toBe("All tests pass.");
    expect(session?.commitHash).toBe("abc1234");
  });

  it("deletes a session", () => {
    const card = fixtureCard();
    const created = createAgentSessionForCard(baseData({ cards: [card] }), { cardId: card.id }, FIXED_NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const cleared = deleteAgentSession(created.state, created.sessionId);
    expect(getAgentSessionsForCard(cleared, card.id)).toEqual([]);
  });

  it("scopes sessions by card", () => {
    const firstCard = fixtureCard({ id: "card-one", title: "First Card" });
    const secondCard = fixtureCard({ id: "card-two", title: "Second Card" });
    const created = createAgentSessionForCard(
      baseData({ cards: [firstCard, secondCard] }),
      { cardId: secondCard.id, taskName: "Second session" },
      FIXED_NOW
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    expect(getAgentSessionsForCard(created.state, firstCard.id)).toEqual([]);
    expect(getAgentSessionsForCard(created.state, secondCard.id)[0]?.taskName).toBe("Second session");
  });

  it("returns recent sessions newest first", () => {
    const card = fixtureCard();
    const first = createAgentSessionForCard(
      baseData({ cards: [card] }),
      { cardId: card.id, taskName: "Older session" },
      "2026-06-08T10:00:00.000Z"
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = createAgentSessionForCard(
      first.state,
      { cardId: card.id, taskName: "Newer session" },
      "2026-06-09T12:00:00.000Z"
    );
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    const recent = getRecentAgentSessions(second.state, 5);
    expect(recent.map((session) => session.taskName)).toEqual(["Newer session", "Older session"]);
  });

  it("builds a proof summary from session fields", () => {
    const summary = buildAgentSessionProofSummary({
      id: "session-1",
      cardId: "card-1",
      agent: "codex",
      status: "done",
      taskName: "Ship agent session log",
      goal: "Add session tracking.",
      resultSummary: "Tests pass.",
      commitHash: "abc1234",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW
    });

    expect(summary.proofTitle).toBe("Agent session: Ship agent session log");
    expect(summary.logText).toContain("Tests pass.");
    expect(summary.logText).toContain("abc1234");
  });

  it("creates completion evidence once and remains idempotent", () => {
    const card = fixtureCard();
    const created = createAgentSessionForCard(baseData({ cards: [card] }), { cardId: card.id }, FIXED_NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const first = applyCompleteAgentSessionWithEvidence(
      created.state,
      created.sessionId,
      { resultSummary: "Shipped." },
      FIXED_NOW
    );
    expect(first.ok).toBe(true);
    expect(first.state.logs).toHaveLength(createSeedState(FIXED_NOW).logs.length + 1);
    expect(first.state.proofItems).toHaveLength(createSeedState(FIXED_NOW).proofItems.length + 1);

    const session = first.state.agentSessions.find((item) => item.id === created.sessionId);
    expect(session?.evidenceLogId).toBeTruthy();
    expect(session?.evidenceProofItemId).toBeTruthy();
    expect(sessionAlreadyHasEvidence(session!)).toBe(true);

    const second = applyCompleteAgentSessionWithEvidence(
      first.state,
      created.sessionId,
      { resultSummary: "Updated summary." },
      FIXED_NOW
    );
    expect(second.ok).toBe(true);
    expect(second.state.logs).toHaveLength(first.state.logs.length);
    expect(second.state.proofItems).toHaveLength(first.state.proofItems.length);
    expect(second.state.agentSessions.find((item) => item.id === created.sessionId)?.resultSummary).toBe(
      "Updated summary."
    );
    expect(second.state.agentSessions.find((item) => item.id === created.sessionId)?.evidenceLogId).toBe(
      session?.evidenceLogId
    );
  });
});
