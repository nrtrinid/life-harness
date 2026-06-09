import { describe, expect, it } from "vitest";

import {
  buildCareerStats,
  checkCareerUseBeforeImproveLocks,
  createCareerApplicationCard,
  getFollowUpsDue,
  syncApplicationStatus
} from "./career";
import { seedJobCandidates } from "../data/seedJobScout";
import type { LifeCard, LifeLogEntry } from "./types";

describe("syncApplicationStatus", () => {
  it("syncs state and applicationStatus on application cards", () => {
    const card = createCareerApplicationCard({
      company: "Acme",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software",
      applicationStatus: "inbox"
    });

    const synced = syncApplicationStatus(card, "parked");

    expect(synced.state).toBe("parked");
    expect(synced.careerApplication?.applicationStatus).toBe("parked");
  });

  it("only updates state on non-application cards", () => {
    const card: LifeCard = {
      id: "build-1",
      title: "Build",
      area: "build",
      state: "active",
      progress: 10,
      warmth: "hot",
      nextTinyAction: "Do thing",
      recentWins: [],
      openLoops: [],
      optimizationIdeas: [],
      proofItemIds: []
    };

    const synced = syncApplicationStatus(card, "parked");

    expect(synced.state).toBe("parked");
    expect(synced.careerApplication).toBeUndefined();
  });
});

describe("createCareerApplicationCard", () => {
  it("defaults to inbox status", () => {
    const card = createCareerApplicationCard({
      company: "Acme",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software"
    });

    expect(card.state).toBe("inbox");
    expect(card.careerApplication?.applicationStatus).toBe("inbox");
    expect(card.title).toBe("Acme — Engineer");
    expect(card.nextTinyAction).toBe("Choose resume angle or identify 3 matching bullets.");
  });
});

describe("getFollowUpsDue", () => {
  it("returns application cards with follow-up date on or before today", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const cards: LifeCard[] = [
      createCareerApplicationCard({
        company: "Due Co",
        roleTitle: "Role",
        jobDescription: "desc",
        roleType: "it",
        applicationStatus: "waiting",
        followUpDate: "2026-06-09"
      }),
      createCareerApplicationCard({
        company: "Future Co",
        roleTitle: "Role",
        jobDescription: "desc",
        roleType: "it",
        applicationStatus: "waiting",
        followUpDate: "2026-06-15"
      })
    ];

    const due = getFollowUpsDue(cards, now);

    expect(due).toHaveLength(1);
    expect(due[0].careerApplication?.company).toBe("Due Co");
  });

  it("excludes terminal cards", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const card = createCareerApplicationCard({
      company: "Done Co",
      roleTitle: "Role",
      jobDescription: "desc",
      roleType: "it",
      applicationStatus: "done",
      followUpDate: "2026-06-01"
    });

    expect(getFollowUpsDue([card], now)).toHaveLength(0);
  });
});

describe("buildCareerStats", () => {
  it("counts applications and career pounces", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const cards = [
      createCareerApplicationCard({
        company: "A",
        roleTitle: "R",
        jobDescription: "d",
        roleType: "software",
        applicationStatus: "inbox"
      }),
      createCareerApplicationCard({
        company: "B",
        roleTitle: "R",
        jobDescription: "d",
        roleType: "software",
        applicationStatus: "waiting"
      })
    ];
    const logs: LifeLogEntry[] = [
      {
        id: "log-1",
        timestamp: now.toISOString(),
        rawText: "started career pounce",
        area: "social_career",
        type: "pounce",
        xp: 10
      }
    ];

    const stats = buildCareerStats(cards, logs, now);

    expect(stats.applicationsStarted).toBe(2);
    expect(stats.applicationsSubmitted).toBe(1);
    expect(stats.careerPounces).toBe(1);
  });
});

describe("checkCareerUseBeforeImproveLocks", () => {
  it("returns v0.3 scout lock thresholds", () => {
    const locks = checkCareerUseBeforeImproveLocks([], [], seedJobCandidates, []);

    expect(locks).toHaveLength(5);
    expect(locks.find((lock) => lock.id === "manual-run-fetching")?.enabled).toBe(true);
    expect(locks.find((lock) => lock.id === "scheduled-fetching")?.required).toBe(5);
    expect(locks.find((lock) => lock.id === "resume-automation")?.required).toBe(5);
    expect(locks.find((lock) => lock.id === "ai-matching")?.required).toBe(10);
    expect(locks.find((lock) => lock.id === "auto-apply")?.notSupported).toBe(true);
  });
});
