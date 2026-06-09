import { describe, expect, it } from "vitest";

import { findCardByTitleTokens } from "./cardMatching";
import type { LifeCard } from "./types";

const cards: LifeCard[] = [
  {
    id: "text-rpg",
    title: "Text RPG",
    area: "build",
    state: "active",
    progress: 62,
    warmth: "warm",
    nextTinyAction: "Write one enemy behavior test.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: []
  },
  {
    id: "local-llm-setup",
    title: "Local LLM Setup",
    area: "money_independence",
    state: "parked",
    progress: 15,
    warmth: "dormant",
    nextTinyAction: "Pick one use case before researching models.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: []
  },
  {
    id: "life-harness",
    title: "Life Harness",
    area: "build",
    state: "active",
    progress: 10,
    warmth: "hot",
    nextTinyAction: "Scaffold v0.1 app.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: []
  }
];

describe("findCardByTitleTokens", () => {
  it("matches park local llm to Local LLM Setup", () => {
    expect(findCardByTitleTokens(cards, "park local llm")?.id).toBe("local-llm-setup");
  });

  it("matches worked on rpg to Text RPG", () => {
    expect(findCardByTitleTokens(cards, "worked on rpg")?.id).toBe("text-rpg");
  });

  it("matches worked on life harness to Life Harness", () => {
    expect(findCardByTitleTokens(cards, "worked on life harness")?.id).toBe("life-harness");
  });
});
