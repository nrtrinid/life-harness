import { describe, expect, it } from "vitest";

import { computeBonusTrack } from "./bonusTrack";
import type { Briefing, LifeCard, PrimaryAction } from "./types";

const pouncePrimary: PrimaryAction = {
  kind: "pounce",
  title: "Apply to one role",
  reason: "Momentum",
  smallestAction: "Paste one job description into intake."
};

const emptyBriefing: Briefing = {
  id: "b1",
  createdAt: "2026-06-09T12:00:00.000Z",
  title: "While You Were Away",
  updated: [],
  detected: [],
  prepared: []
};

describe("computeBonusTrack", () => {
  it("returns salvage when primary is pounce and salvage is prepared", () => {
    const briefing: Briefing = {
      ...emptyBriefing,
      prepared: [
        "Suggested pounce: Paste one job description into intake.",
        "Suggested salvage: Spend 15 min on EV Tracker README."
      ]
    };

    const bonus = computeBonusTrack(briefing, pouncePrimary);
    expect(bonus?.title).toBe("Spend 15 min on EV Tracker README.");
    expect(bonus?.ctaLabel).toBe("Take it");
  });

  it("returns detected improvement when no unused prepared lines", () => {
    const cards: LifeCard[] = [
      {
        id: "ev",
        title: "EV Tracker",
        area: "build",
        state: "active",
        progress: 10,
        warmth: "cold",
        nextTinyAction: "Update README.",
        recentWins: [],
        openLoops: [],
        optimizationIdeas: [],
        proofItemIds: [],
        lastTouched: "2026-06-01T12:00:00.000Z"
      }
    ];
    const briefing: Briefing = {
      ...emptyBriefing,
      detected: ["EV Tracker has been idle 5 days."]
    };

    const bonus = computeBonusTrack(briefing, pouncePrimary, cards);
    expect(bonus?.title).toContain("EV Tracker");
    expect(bonus?.targetRoute).toBe("/card/ev");
  });

  it("returns null when nothing secondary is available", () => {
    expect(computeBonusTrack(emptyBriefing, pouncePrimary)).toBeNull();
  });
});
