import { describe, expect, it } from "vitest";

import {
  generateWhileYouWereAway,
  getBriefingHighlightItems,
  getBriefingHighlights,
  startSession
} from "./briefing";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { applyImportCareerSourcePack } from "./actions";
import { createSeedState } from "../data/createSeedState";
import { seedJobCandidates, seedJobSources } from "../data/seedJobScout";
import type { DailyState, LifeCard, LifeLogEntry, ProofItem } from "./types";

const packFixture = readFileSync(
  join(process.cwd(), "public/fixtures/sample-career-source-pack.v1.json"),
  "utf8"
);

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

  it("rolls briefing window forward on session start", () => {
    const firstOpen = startSession(baseDaily, "2026-06-09T12:00:00.000Z");

    expect(firstOpen.briefingSinceAt).toBe("2026-06-07T08:00:00.000Z");
    expect(firstOpen.lastOpenedAt).toBe("2026-06-09T12:00:00.000Z");
    expect(firstOpen.sessionStartedAt).toBe("2026-06-09T12:00:00.000Z");

    const secondOpen = startSession(firstOpen, "2026-06-10T09:00:00.000Z");

    expect(secondOpen.briefingSinceAt).toBe("2026-06-09T12:00:00.000Z");
    expect(secondOpen.lastOpenedAt).toBe("2026-06-10T09:00:00.000Z");
  });

  it("includes proof activity since previous open", () => {
    const daily = startSession(baseDaily, "2026-06-09T12:00:00.000Z");

    const proof: ProofItem[] = [
      {
        id: "proof-new",
        timestamp: "2026-06-09T11:30:00.000Z",
        title: "Started pounce mission.",
        area: "build",
        sourceLogId: "log-pounce"
      }
    ];

    const briefing = generateWhileYouWereAway([], [], proof, daily, NOW);

    expect(briefing.updated.some((line) => line.includes("Started pounce mission."))).toBe(true);
  });

  it("handles first open with no prior timestamps", () => {
    const emptyDaily: DailyState = {
      date: "2026-06-09",
      mode: "normal",
      pounceStarted: false,
      minimumViableDayCompleted: false,
      salvageCompleted: false
    };
    const nowIso = "2026-06-09T12:00:00.000Z";
    const daily = startSession(emptyDaily, nowIso);

    expect(daily.briefingSinceAt).toBe(nowIso);
    expect(daily.lastOpenedAt).toBe(nowIso);

    const briefing = generateWhileYouWereAway([], [], [], daily, NOW);
    expect(briefing.updated).toHaveLength(0);
  });

  it("preserves seeded demo away window", () => {
    const daily = startSession(baseDaily, "2026-06-09T12:00:00.000Z");
    const cards = [
      makeCard({
        id: "life-harness",
        title: "Life Harness",
        state: "active",
        lastTouched: "2026-06-08T10:00:00.000Z"
      })
    ];

    const briefing = generateWhileYouWereAway(cards, [], [], daily, NOW);

    expect(daily.briefingSinceAt).toBe("2026-06-07T08:00:00.000Z");
    expect(briefing.updated.some((line) => line.includes("Life Harness was touched"))).toBe(true);
  });
});

describe("startSession", () => {
  it("detects dormant cards with rolled-forward watermark", () => {
    const daily = startSession(baseDaily, "2026-06-09T12:00:00.000Z");
    const cards = [makeCard({ state: "active", lastTouched: "2026-05-01T12:00:00.000Z" })];
    const briefing = generateWhileYouWereAway(cards, [], [], daily, NOW);

    expect(briefing.detected.some((line) => line.includes("dormant"))).toBe(true);
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

  it("suggests importing career pack when fetched candidates exist without pack", () => {
    const fetchedCandidate = {
      ...seedJobCandidates[0],
      id: "candidate-fetched-pack",
      origin: "source_fetch" as const,
      status: "new" as const
    };
    const briefing = generateWhileYouWereAway(
      [],
      [],
      [],
      baseDaily,
      NOW,
      [fetchedCandidate],
      seedJobSources,
      [],
      null,
      []
    );
    expect(
      briefing.detected.some((line) => line.includes("Import Career Source Pack"))
    ).toBe(true);
  });

  it("mentions strong pack matches when pack is imported", () => {
    const imported = applyImportCareerSourcePack(createSeedState(), packFixture);
    expect(imported.ok).toBe(true);
    const candidate = {
      ...seedJobCandidates[0],
      id: "candidate-pack-strong",
      origin: "source_fetch" as const,
      status: "new" as const,
      company: "Northrop Grumman",
      roleTitle: "Software Engineer I",
      description:
        "Python C++ Linux security. Able to obtain Secret clearance. New grad friendly."
    };
    const briefing = generateWhileYouWereAway(
      [],
      [],
      [],
      baseDaily,
      NOW,
      [candidate],
      seedJobSources,
      [],
      imported.state.careerSourcePack,
      imported.state.resumeModules
    );
    expect(
      briefing.detected.some(
        (line) =>
          line.includes("match strongly") || line.includes("Career Pack imported")
      )
    ).toBe(true);
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
