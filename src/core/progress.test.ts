import { describe, expect, it } from "vitest";

import { computeCardProgress } from "./progress";
import type { LifeCard, LifeLogEntry } from "./types";

const card: LifeCard = {
  id: "text-rpg",
  title: "Text RPG",
  area: "build",
  state: "active",
  progress: 60,
  warmth: "warm",
  nextTinyAction: "Write one enemy behavior test.",
  recentWins: [],
  openLoops: [],
  optimizationIdeas: [],
  proofItemIds: []
};

const SESSION_START = "2026-06-09T12:00:00.000Z";

describe("computeCardProgress", () => {
  it("returns seed baseline when there are no win logs", () => {
    expect(computeCardProgress(card, [])).toBe(60);
  });

  it("ignores win logs before session start", () => {
    const logs: LifeLogEntry[] = [
      {
        id: "log-1",
        timestamp: "2026-06-09T10:00:00.000Z",
        rawText: "worked on rpg",
        area: "build",
        cardId: "text-rpg",
        type: "win",
        xp: 15
      }
    ];

    expect(computeCardProgress(card, logs, SESSION_START)).toBe(60);
  });

  it("adds 5 per session win log", () => {
    const logs: LifeLogEntry[] = [
      {
        id: "log-1",
        timestamp: "2026-06-09T12:30:00.000Z",
        rawText: "worked on rpg",
        area: "build",
        cardId: "text-rpg",
        type: "win",
        xp: 15
      },
      {
        id: "log-2",
        timestamp: "2026-06-09T13:00:00.000Z",
        rawText: "worked on rpg again",
        area: "build",
        cardId: "text-rpg",
        type: "win",
        xp: 15
      }
    ];

    expect(computeCardProgress(card, logs, SESSION_START)).toBe(70);
  });

  it("caps progress at 100", () => {
    const logs: LifeLogEntry[] = Array.from({ length: 20 }, (_, index) => ({
      id: `log-${index}`,
      timestamp: "2026-06-09T13:00:00.000Z",
      rawText: "worked on rpg",
      area: "build" as const,
      cardId: "text-rpg",
      type: "win" as const,
      xp: 15
    }));

    expect(computeCardProgress(card, logs, SESSION_START)).toBe(100);
  });
});
