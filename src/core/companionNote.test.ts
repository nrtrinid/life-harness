import { describe, expect, it } from "vitest";

import { buildCompanionNote } from "./companionNote";
import { generateWhileYouWereAway } from "./briefing";
import type { DailyState, LifeCard } from "./types";

const now = new Date("2026-06-10T12:00:00.000Z");

const baseDaily: DailyState = {
  date: "2026-06-10",
  mode: "normal",
  briefingSinceAt: now.toISOString(),
  lastOpenedAt: now.toISOString(),
  sessionStartedAt: now.toISOString(),
  pounceMission: "Send one follow-up",
  smallestStart: "Draft one line",
  pounceStarted: false,
  minimumViableDayCompleted: false,
  salvageCompleted: false
};

describe("buildCompanionNote", () => {
  it("returns warm fallback when board is quiet", () => {
    const note = buildCompanionNote(
      { id: "b1", createdAt: now.toISOString(), title: "t", updated: [], detected: [], prepared: [] },
      [],
      baseDaily,
      [],
      now
    );
    expect(note).toContain("One small move");
  });

  it("folds follow-up urgency into prose", () => {
    const cards: LifeCard[] = [
      {
        id: "c1",
        title: "Acme application",
        area: "social_career",
        state: "active",
        progress: 0,
        nextTinyAction: "Send follow-up",
        careerApplication: { followUpDate: "2026-06-10" }
      } as LifeCard
    ];
    const briefing = generateWhileYouWereAway(cards, [], [], baseDaily, now);
    const note = buildCompanionNote(briefing, cards, baseDaily, [], now);
    expect(note.toLowerCase()).toMatch(/follow-up|acme/);
  });

  it("uses hedged language for briefing updates", () => {
    const briefing = generateWhileYouWereAway(
      [
        {
          id: "c2",
          title: "Side project",
          area: "build",
          state: "active",
          progress: 10,
          nextTinyAction: "Commit one file"
        } as LifeCard
      ],
      [],
      [],
      baseDaily,
      now
    );
    const note = buildCompanionNote(briefing, [], baseDaily, [], now);
    expect(note.length).toBeGreaterThan(10);
    expect(note).not.toMatch(/I noticed|I feel/);
  });
});
