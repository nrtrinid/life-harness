import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import type { LifeHarnessData } from "./lifeHarnessData";
import {
  buildProjectContextForCard,
  deleteProjectForCard,
  formatListField,
  getProjectForCard,
  parseListField,
  upsertProjectForCard
} from "./projectRegistry";
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
    nextTinyAction: "Add project registry.",
    doneForNow: "Registry drafted.",
    doLane: "Wire card detail editor.",
    improveLane: "Do not add sprint tracker.",
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

describe("projectRegistry", () => {
  it("normalizes missing projects to an empty array", () => {
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
      memoryItems: []
    });

    expect(normalized.projects).toEqual([]);
  });

  it("creates and updates a project by cardId", () => {
    const card = fixtureCard();
    const data = baseData({ cards: [card] });

    const created = upsertProjectForCard(
      data,
      {
        cardId: card.id,
        repoPath: "C:/Users/me/Projects/life-harness",
        likelyFiles: ["src/core/projectRegistry.ts"]
      },
      FIXED_NOW
    );

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const first = getProjectForCard(created.state, card.id);
    expect(first?.name).toBe(card.title);
    expect(first?.repoPath).toBe("C:/Users/me/Projects/life-harness");
    expect(first?.likelyFiles).toEqual(["src/core/projectRegistry.ts"]);

    const updated = upsertProjectForCard(
      created.state,
      {
        cardId: card.id,
        branch: "main",
        verificationCommands: ["npm test -- projectRegistry"]
      },
      FIXED_NOW
    );

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    const second = getProjectForCard(updated.state, card.id);
    expect(second?.id).toBe(first?.id);
    expect(second?.branch).toBe("main");
    expect(second?.verificationCommands).toEqual(["npm test -- projectRegistry"]);
    expect(second?.likelyFiles).toBeUndefined();
  });

  it("deletes the project for a card", () => {
    const card = fixtureCard();
    const created = upsertProjectForCard(baseData({ cards: [card] }), {
      cardId: card.id,
      repoPath: "C:/repo"
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const cleared = deleteProjectForCard(created.state, card.id);
    expect(getProjectForCard(cleared, card.id)).toBeUndefined();
  });

  it("does not return another card's project", () => {
    const firstCard = fixtureCard({ id: "card-one", title: "First Card" });
    const secondCard = fixtureCard({ id: "card-two", title: "Second Card" });
    const created = upsertProjectForCard(baseData({ cards: [firstCard, secondCard] }), {
      cardId: secondCard.id,
      repoPath: "C:/second"
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    expect(getProjectForCard(created.state, firstCard.id)).toBeUndefined();
    expect(buildProjectContextForCard(created.state, firstCard.id)).toBeUndefined();
    expect(buildProjectContextForCard(created.state, secondCard.id)?.repoPath).toBe("C:/second");
  });

  it("parses and formats list fields", () => {
    expect(parseListField("a, b\n c ")).toEqual(["a", "b", "c"]);
    expect(formatListField(["a", "b"])).toBe("a\nb");
  });
});
