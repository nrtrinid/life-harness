import { describe, expect, it } from "vitest";

import {
  generateWhileYouWereAway,
  getBriefingHighlightItems,
  getBriefingHighlights,
  startSession
} from "./briefing";
import { seedJobCandidates, seedJobSources } from "../data/seedJobScout";
import type { DailyState, LifeCard, LifeLogEntry, ProofItem } from "./types";

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
    lastTouched: "2026-05-20T12:00:00.000Z",
    ...overrides
  };
}

const baseDaily: DailyState = {
  date: "2026-06-09",
  mode: "normal",
  mainQuestId: "life-harness",
  pounceMission: "Scaffold v0.1 app.",
  smallestStart: "Open repo.",
  pounceStarted: false,
  minimumViableDayCompleted: false,
  salvageCompleted: false,
  lastOpenedAt: "2026-06-07T08:00:00.000Z"
};

describe("generateWhileYouWereAway", () => {
  it("detects active over limit", () => {
    const cards = [
      makeCard({ id: "a", state: "active" }),
      makeCard({ id: "b", state: "active", title: "B" }),
      makeCard({ id: "c", state: "active", title: "C" }),
      makeCard({ id: "d", state: "active", title: "D" })
    ];
    const briefing = generateWhileYouWereAway(cards, [], [], baseDaily, NOW);
    expect(briefing.detected.some((line) => line.includes("4/3") && line.includes("Park one soon"))).toBe(true);
  });

  it("detects dormant active card", () => {
    const cards = [makeCard({ state: "active", lastTouched: "2026-05-01T12:00:00.000Z" })];
    const briefing = generateWhileYouWereAway(cards, [], [], baseDaily, NOW);
    expect(briefing.detected.some((line) => line.includes("dormant"))).toBe(true);
  });

  it("suggests career pounce when networking is cold", () => {
    const cards = [
      makeCard({
        id: "career-networking",
        title: "Career / Networking",
        area: "social_career",
        state: "active",
        lastTouched: "2026-05-01T12:00:00.000Z",
        nextTinyAction: "Send one follow-up."
      })
    ];
    const briefing = generateWhileYouWereAway(cards, [], [], baseDaily, NOW);
    expect(
      briefing.prepared.some((line) => line.includes("paste one job description or send one follow-up"))
    ).toBe(true);
  });

  it("uses frozen briefingSinceAt after session start", () => {
    const daily = startSession(
      {
        ...baseDaily,
        briefingSinceAt: "2026-06-07T08:00:00.000Z",
        sessionStartedAt: "2026-06-09T12:00:00.000Z"
      },
      "2026-06-09T12:00:00.000Z"
    );

    const logs: LifeLogEntry[] = [
      {
        id: "log-new",
        timestamp: "2026-06-09T11:00:00.000Z",
        rawText: "worked on harness",
        area: "build",
        cardId: "life-harness",
        type: "win",
        xp: 15
      }
    ];

    const proof: ProofItem[] = [
      {
        id: "proof-new",
        timestamp: "2026-06-09T11:30:00.000Z",
        title: "Started pounce mission.",
        area: "build",
        sourceLogId: "log-pounce"
      }
    ];

    const cards = [
      makeCard({
        id: "life-harness",
        title: "Life Harness",
        state: "active",
        lastTouched: "2026-06-09T10:00:00.000Z"
      })
    ];

    const briefing = generateWhileYouWereAway(cards, logs, proof, daily, NOW);
    expect(daily.briefingSinceAt).toBe("2026-06-07T08:00:00.000Z");
    expect(briefing.updated.length).toBeGreaterThan(0);
    expect(startSession(daily, NOW.toISOString()).briefingSinceAt).toBe("2026-06-07T08:00:00.000Z");
  });
});

describe("getBriefingHighlightItems", () => {
  it("attaches cardId for career pounce suggestion when networking cold", () => {
    const cards = [
      makeCard({
        id: "career-networking",
        title: "Career / Networking",
        area: "social_career",
        state: "active",
        lastTouched: "2026-05-01T12:00:00.000Z",
        nextTinyAction: "Send one follow-up."
      })
    ];
    const briefing = generateWhileYouWereAway(cards, [], [], baseDaily, NOW);
    const items = getBriefingHighlightItems(briefing, cards, baseDaily, [], NOW, 5);
    const pounce = items.find((item) => item.text.includes("paste one job description"));

    expect(pounce).toBeDefined();
  });

  it("attaches cardId for waiting cooled copy", () => {
    const cards = [
      makeCard({
        id: "qualcomm",
        title: "Qualcomm Follow-up",
        state: "waiting",
        lastTouched: "2026-05-01T12:00:00.000Z"
      })
    ];
    const briefing = generateWhileYouWereAway(cards, [], [], baseDaily, NOW);
    const items = getBriefingHighlightItems(briefing, cards, baseDaily, [], NOW, 5);
    const waiting = items.find((item) => item.text.includes("cooled while waiting"));

    expect(waiting?.cardId).toBe("qualcomm");
  });
});

describe("getBriefingHighlights", () => {
  it("caps output at 5 items", () => {
    const briefing = generateWhileYouWereAway(
      [
        makeCard({ id: "a", state: "active" }),
        makeCard({ id: "b", state: "active", title: "B" }),
        makeCard({ id: "c", state: "active", title: "C" }),
        makeCard({ id: "d", state: "active", title: "D" })
      ],
      [],
      [],
      baseDaily,
      NOW
    );
    expect(getBriefingHighlights(briefing, 5).length).toBeLessThanOrEqual(5);
  });
});

describe("scout briefing signals", () => {
  it("mentions saved candidates and approved sources", () => {
    const briefing = generateWhileYouWereAway(
      [],
      [],
      [],
      baseDaily,
      NOW,
      seedJobCandidates,
      seedJobSources
    );

    expect(briefing.detected.some((line) => line.includes("saved job candidates"))).toBe(true);
    expect(briefing.detected.some((line) => line.includes("Approved job sources ready"))).toBe(
      true
    );
    expect(
      briefing.prepared.some(
        (line) =>
          line.includes("Candidate Intake") ||
          line.includes("approve one saved candidate") ||
          line.includes("run one approved job source")
      )
    ).toBe(true);
  });

  it("mentions fetched candidates when present", () => {
    const fetchedCandidate = {
      ...seedJobCandidates[0],
      id: "candidate-fetched",
      origin: "source_fetch" as const,
      status: "new" as const,
      fitScore: 80
    };
    const briefing = generateWhileYouWereAway(
      [],
      [],
      [],
      baseDaily,
      NOW,
      [fetchedCandidate],
      seedJobSources,
      [
        {
          sourceId: "source-fixture-greenhouse",
          fetchedAt: "2026-06-09T12:00:00.000Z",
          createdCandidateIds: ["candidate-fetched"],
          skippedDuplicates: 0,
          errors: [],
          message: "Found 1 new candidate."
        }
      ]
    );

    expect(briefing.detected.some((line) => line.includes("fetched candidates"))).toBe(true);
    expect(briefing.detected.some((line) => line.includes("High-fit fetched candidate"))).toBe(
      true
    );
    expect(briefing.prepared.some((line) => line.includes("review one fetched candidate"))).toBe(
      true
    );
  });

  it("mentions due job sources when a daily source is overdue", () => {
    const briefing = generateWhileYouWereAway(
      [],
      [],
      [],
      baseDaily,
      NOW,
      [],
      [
        {
          id: "source-due",
          name: "Due Fixture",
          url: "/fixtures/sample-greenhouse.json",
          kind: "greenhouse",
          enabled: true,
          cadence: "daily",
          maxResults: 25,
          runStatus: "idle"
        }
      ],
      []
    );

    expect(briefing.detected.some((line) => line.includes("job source"))).toBe(true);
    expect(briefing.prepared.some((line) => line.includes("run due job sources"))).toBe(true);
  });
});
