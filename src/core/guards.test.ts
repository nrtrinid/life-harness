import { describe, expect, it } from "vitest";

import { canActivateCard } from "./guards";
import type { LifeCard } from "./types";

function makeCard(id: string, state: LifeCard["state"]): LifeCard {
  return {
    id,
    title: id,
    area: "build",
    state,
    progress: 0,
    warmth: "cold",
    nextTinyAction: "test",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: []
  };
}

describe("canActivateCard", () => {
  const fourActive = [
    makeCard("a", "active"),
    makeCard("b", "active"),
    makeCard("c", "active"),
    makeCard("d", "active"),
    makeCard("inbox", "inbox")
  ];

  it("blocks activating a fourth card when already at limit", () => {
    const result = canActivateCard(fourActive, "inbox");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Active is full");
  });

  it("allows already-active card", () => {
    const result = canActivateCard(fourActive, "a");
    expect(result.ok).toBe(true);
  });

  it("allows activation when below limit", () => {
    const cards = [makeCard("a", "active"), makeCard("b", "active"), makeCard("inbox", "inbox")];
    const result = canActivateCard(cards, "inbox");
    expect(result.ok).toBe(true);
  });
});
