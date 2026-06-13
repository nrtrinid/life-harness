import { describe, expect, it } from "vitest";

import { computePrimaryAction } from "./primaryAction";
import type { Briefing, DailyState, LifeCard, LifeLogEntry } from "./types";

const NOW = new Date("2026-06-09T12:00:00.000Z");

function makeCard(overrides: Partial<LifeCard>): LifeCard {
  return {
    id: "card-1",
    title: "Fitness Return",
    area: "body",
    state: "active",
    progress: 20,
    warmth: "cooling",
    nextTinyAction: "Walk 10 minutes.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    lastTouched: "2026-06-08T12:00:00.000Z",
    ...overrides
  };
}

const emptyBriefing: Briefing = {
  id: "briefing-today",
  createdAt: NOW.toISOString(),
  title: "While You Were Away",
  updated: [],
  detected: [],
  prepared: []
};

const baseDaily: DailyState = {
  date: "2026-06-09",
  mode: "normal",
  mainQuestId: "life-harness",
  pounceMission: "Scaffold v0.1 app.",
  smallestStart: "Open repo.",
  pounceStarted: false,
  minimumViableDayCompleted: false,
  salvageCompleted: false
};

describe("computePrimaryAction", () => {
  it("active limit exceeded wins as hero kind", () => {
    const cards = [
      makeCard({ id: "a" }),
      makeCard({ id: "b", title: "B" }),
      makeCard({ id: "c", title: "C" }),
      makeCard({ id: "d", title: "D" })
    ];
    const followUpCard = makeCard({
      id: "northrop",
      title: "Northrop Application",
      careerApplication: {
        company: "Northrop",
        roleTitle: "Engineer",
        jobDescription: "Apply",
        roleType: "software",
        applicationStatus: "waiting",
        followUpDate: "2026-06-09"
      }
    });

    const action = computePrimaryAction(emptyBriefing, baseDaily, [...cards, followUpCard], [], NOW);

    expect(action.kind).toBe("park");
    expect(action.targetRoute).toBe("/board");
    expect(action.reason).toContain("Also due today: Northrop Application follow-up");
  });

  it("due follow-up beats generic pounce when not over limit", () => {
    const cards = [
      makeCard({
        id: "northrop",
        title: "Northrop Application",
        careerApplication: {
          company: "Northrop",
          roleTitle: "Engineer",
          jobDescription: "Apply",
          roleType: "software",
          applicationStatus: "waiting",
          followUpDate: "2026-06-09"
        }
      })
    ];

    const action = computePrimaryAction(emptyBriefing, baseDaily, cards, [], NOW);

    expect(action.kind).toBe("follow_up");
    expect(action.cardId).toBe("northrop");
  });

  it("dormant active card produces reheat", () => {
    const cards = [
      makeCard({
        id: "stale",
        title: "Stale Project",
        lastTouched: "2026-05-01T12:00:00.000Z",
        nextTinyAction: "Review one note."
      })
    ];
    const daily: DailyState = { ...baseDaily, pounceStarted: true };

    const action = computePrimaryAction(emptyBriefing, daily, cards, [], NOW);

    expect(action.kind).toBe("reheat");
    expect(action.cardId).toBe("stale");
    expect(action.smallestAction).toBe("Review one note.");
  });

  it("main quest fallback works when board is healthy", () => {
    const cards = [
      makeCard({
        id: "life-harness",
        title: "Life Harness",
        lastTouched: NOW.toISOString(),
        nextTinyAction: "Ship one screen."
      })
    ];
    const daily: DailyState = { ...baseDaily, pounceStarted: true, mainQuestId: "life-harness" };

    const action = computePrimaryAction(emptyBriefing, daily, cards, [], NOW);

    expect(action.kind).toBe("main_quest");
    expect(action.cardId).toBe("life-harness");
  });

  it("empty state produces capture fallback", () => {
    const emptyDaily: DailyState = {
      date: "2026-06-09",
      mode: "normal",
      pounceStarted: false,
      minimumViableDayCompleted: false,
      salvageCompleted: false
    };
    const action = computePrimaryAction(emptyBriefing, emptyDaily, [], [], NOW);

    expect(action.kind).toBe("capture");
  });

  it("minimal state with cards but no quest produces proof fallback", () => {
    const cards = [makeCard({ id: "orphan", nextTinyAction: undefined })];
    const daily: DailyState = { ...baseDaily, pounceStarted: true, mainQuestId: undefined };

    const action = computePrimaryAction(emptyBriefing, daily, cards, [], NOW);

    expect(action.kind).toBe("proof");
    expect(action.targetRoute).toBe("/log");
  });

  it("suggests pounce when mission available and not started", () => {
    const cards = [makeCard({ id: "life-harness", lastTouched: NOW.toISOString() })];
    const briefing: Briefing = {
      ...emptyBriefing,
      prepared: ["Suggested pounce: paste one job into Candidate Intake"]
    };

    const action = computePrimaryAction(briefing, baseDaily, cards, [], NOW);

    expect(action.kind).toBe("pounce");
    expect(action.targetRoute).toBe("/career?tab=find&add=1");
  });
});
