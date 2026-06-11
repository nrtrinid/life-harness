import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { createCareerApplicationCard } from "./career";
import type { LifeHarnessData } from "./lifeHarnessData";
import {
  buildNextMoveContracts,
  buildNextMoveSummary,
  rankNextMoveContracts
} from "./nextMoveContract";
import type { HarnessAgentSession, LifeCard } from "./types";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";
const NOW = new Date(FIXED_NOW);

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

function assertContractFields(contracts: ReturnType<typeof buildNextMoveContracts>) {
  for (const contract of contracts) {
    expect(contract.pressureLabel.trim().length).toBeGreaterThan(0);
    expect(contract.proofOnDone.trim().length).toBeGreaterThan(0);
  }
}

describe("buildNextMoveSummary", () => {
  it("returns a safe bounded summary for seed data", () => {
    const summary = buildNextMoveSummary(createSeedState(FIXED_NOW), { now: NOW });

    expect(summary.candidates.length).toBeLessThanOrEqual(10);
    assertContractFields(summary.candidates);
  });

  it("emits a board contract for an active card with nextTinyAction", () => {
    const card = fixtureCard({ id: "solo-active", title: "Solo Active" });
    const contracts = buildNextMoveContracts(
      baseData({ cards: [card], dailyState: { ...baseData().dailyState, mainQuestId: undefined } }),
      { now: NOW }
    );

    const boardContract = contracts.find(
      (contract) => contract.source === "board" && contract.cardId === "solo-active"
    );

    expect(boardContract).toBeDefined();
    expect(boardContract?.doAction).toBe("Add agent workbench.");
    expect(boardContract?.pressureLabel).toBe("Active card");
  });

  it("boosts main quest above other active cards", () => {
    const mainQuest = fixtureCard({
      id: "main-quest",
      title: "Main Quest Card",
      nextTinyAction: "Ship the main quest move."
    });
    const otherActive = fixtureCard({
      id: "other-active",
      title: "Other Active",
      nextTinyAction: "Do the other move."
    });

    const data = baseData({
      cards: [otherActive, mainQuest],
      dailyState: { ...baseData().dailyState, mainQuestId: "main-quest" }
    });

    const ranked = rankNextMoveContracts(buildNextMoveContracts(data, { now: NOW }), data, {
      now: NOW
    });

    const mainIndex = ranked.findIndex((contract) => contract.cardId === "main-quest");
    const otherIndex = ranked.findIndex((contract) => contract.cardId === "other-active");

    expect(mainIndex).toBeGreaterThanOrEqual(0);
    expect(otherIndex).toBeGreaterThanOrEqual(0);
    expect(mainIndex).toBeLessThan(otherIndex);
  });

  it("emits a career follow-up contract when follow-up is due", () => {
    const followUpCard = createCareerApplicationCard({
      company: "Northrop",
      roleTitle: "Engineer",
      jobDescription: "Apply",
      roleType: "software",
      applicationStatus: "waiting",
      followUpDate: "2026-06-09"
    });

    const contracts = buildNextMoveContracts(baseData({ cards: [followUpCard] }), { now: NOW });
    const careerContract = contracts.find((contract) => contract.source === "career");

    expect(careerContract).toBeDefined();
    expect(careerContract?.pressureLabel).toBe("Follow-up due");
    expect(careerContract?.cardId).toBe(followUpCard.id);
  });

  it("emits an agent needs-review contract", () => {
    const card = fixtureCard();
    const contracts = buildNextMoveContracts(
      baseData({
        cards: [card],
        agentSessions: [fixtureSession({ status: "reviewing" })]
      }),
      { now: NOW }
    );

    const agentContract = contracts.find((contract) => contract.id.includes("agent-review"));

    expect(agentContract).toBeDefined();
    expect(agentContract?.pressureLabel).toBe("Agent result waiting");
    expect(agentContract?.urgency).toBe("high");
  });

  it("emits a ready-to-delegate contract for project-backed cards", () => {
    const card = fixtureCard();
    const contracts = buildNextMoveContracts(
      baseData({
        cards: [card],
        projects: [
          {
            id: "project-1",
            cardId: card.id,
            name: "Life Harness",
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW
          }
        ]
      }),
      { now: NOW }
    );

    const delegateContract = contracts.find((contract) => contract.id.includes("agent-delegate"));

    expect(delegateContract).toBeDefined();
    expect(delegateContract?.pressureLabel).toBe("Ready to delegate");
  });

  it("includes recovery when board and agent lanes are empty", () => {
    const evening = new Date(NOW);
    evening.setHours(20, 0, 0, 0);
    const summary = buildNextMoveSummary(
      baseData({
        cards: [],
        agentSessions: [],
        projects: [],
        jobCandidates: [],
        dailyState: { ...baseData().dailyState, minimumViableDayCompleted: false }
      }),
      { now: evening }
    );

    const recoveryContract = summary.candidates.find((contract) => contract.source === "recovery");

    expect(recoveryContract).toBeDefined();
    expect(recoveryContract?.pressureLabel).toBe("Day slipping");
  });

  it("ranks deterministically for the same input", () => {
    const data = createSeedState(FIXED_NOW);
    const first = rankNextMoveContracts(buildNextMoveContracts(data, { now: NOW }), data, {
      now: NOW
    }).map((contract) => contract.id);
    const second = rankNextMoveContracts(buildNextMoveContracts(data, { now: NOW }), data, {
      now: NOW
    }).map((contract) => contract.id);

    expect(first).toEqual(second);
  });

  it("returns distinct primary and backup when two candidates exist", () => {
    const card = fixtureCard();
    const summary = buildNextMoveSummary(
      baseData({
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
        agentSessions: [fixtureSession({ status: "reviewing" })]
      }),
      { now: NOW }
    );

    expect(summary.primary).toBeDefined();
    expect(summary.backup).toBeDefined();
    expect(summary.primary?.id).not.toBe(summary.backup?.id);
  });

  it("excludes S3 cards from contracts", () => {
    const s3Card = fixtureCard({ id: "card-s3", sensitivity: "S3" });
    const contracts = buildNextMoveContracts(
      baseData({
        cards: [s3Card],
        agentSessions: [fixtureSession({ cardId: "card-s3", status: "reviewing" })]
      }),
      { now: NOW }
    );

    expect(contracts.some((contract) => contract.cardId === "card-s3")).toBe(false);
  });

  it("includes pressureLabel and proofOnDone on every contract", () => {
    const contracts = buildNextMoveContracts(createSeedState(FIXED_NOW), { now: NOW });
    assertContractFields(contracts);
  });

  it("dedupes by cardId after ranking, keeping the strongest signal", () => {
    const card = fixtureCard({ id: "dup-card" });
    const contracts = buildNextMoveContracts(
      baseData({
        cards: [card],
        agentSessions: [fixtureSession({ cardId: "dup-card", status: "reviewing" })]
      }),
      { now: NOW }
    );

    const ranked = rankNextMoveContracts(contracts, baseData({ cards: [card] }), { now: NOW });
    const dupCardContracts = ranked.filter((contract) => contract.cardId === "dup-card");

    expect(dupCardContracts).toHaveLength(1);
    expect(dupCardContracts[0]?.id).toContain("agent-review");
  });
});
