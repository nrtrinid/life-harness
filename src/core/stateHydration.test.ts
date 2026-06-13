import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { seedJobSources, seedResumeModules } from "../data/seedJobScout";
import { createCareerApplicationCard } from "./career";
import {
  hydrateState,
  mergeSeedDefaults,
  normalizeData,
  preparePersistedState,
  RUN_INTERRUPTED_MESSAGE
} from "./stateHydration";

describe("normalizeData", () => {
  it("defaults missing arrays to empty arrays", () => {
    const normalized = normalizeData({
      cards: [],
      dailyState: {
        date: "2026-06-09",
        mode: "normal",
        pounceStarted: false,
        minimumViableDayCompleted: false,
        salvageCompleted: false
      }
    });

    expect(normalized.logs).toEqual([]);
    expect(normalized.proofItems).toEqual([]);
    expect(normalized.jobSourceRuns).toEqual([]);
    expect(normalized.jobCandidates).toEqual([]);
    expect(normalized.jobSources).toEqual([]);
    expect(normalized.resumeModules).toEqual([]);
    expect(normalized.careerSourcePack).toBeNull();
    expect(normalized.featureSprintPlans).toEqual([]);
    expect(normalized.featureSprintRunnerRuns).toEqual([]);
  });

  it("hydrates old resume modules with default placement", () => {
    const normalized = normalizeData({
      resumeModules: [
        {
          id: "legacy-project",
          title: "Legacy Project",
          category: "project",
          summary: "Old saved module.",
          tags: [],
          bullets: ["Built useful thing"],
          skills: ["TypeScript"],
          bestFor: ["software"],
          isActive: true
        }
      ]
    });

    expect(normalized.resumeModules[0]?.resumePlacement).toMatchObject({
      section: "projects",
      heading: "Legacy Project",
      order: 0
    });
  });

  it("hydrates old application cards without resume draft packets", () => {
    const normalized = normalizeData({
      cards: [
        {
          id: "card-legacy-application",
          title: "Legacy Co - Engineer",
          area: "social_career",
          state: "inbox",
          progress: 0,
          warmth: "cold",
          nextTinyAction: "Choose resume angle.",
          recentWins: [],
          openLoops: [],
          optimizationIdeas: [],
          proofItemIds: [],
          careerApplication: {
            company: "Legacy Co",
            roleTitle: "Engineer",
            jobDescription: "Software role.",
            roleType: "software",
            applicationStatus: "inbox",
            jobCandidateId: "candidate-legacy"
          }
        }
      ]
    });

    expect(normalized.cards[0]?.careerApplication?.resumeDraftPacket).toBeUndefined();
  });

  it("hydrates old snapshots with careerSourcePack null", () => {
    const state = createSeedState();
    const { careerSourcePack: _removed, ...withoutPack } = state;
    const normalized = normalizeData(withoutPack);
    expect(normalized.careerSourcePack).toBeNull();
  });
});

describe("mergeSeedDefaults", () => {
  it("preserves user-edited job source fields", () => {
    const state = createSeedState();
    const editedUrl = "https://user-edited.example/jobs";
    state.jobSources = state.jobSources.map((source) =>
      source.id === "source-microsoft" ? { ...source, url: editedUrl, enabled: true } : source
    );

    const merged = mergeSeedDefaults(state).data;
    const microsoft = merged.jobSources.find((source) => source.id === "source-microsoft");
    expect(microsoft?.url).toBe(editedUrl);
    expect(microsoft?.enabled).toBe(true);
  });

  it("adds new seed resume modules without overwriting existing ones", () => {
    const state = createSeedState();
    state.resumeModules = state.resumeModules.filter((module) => module.id !== "resume-asu");

    const merged = mergeSeedDefaults(state).data;
    expect(merged.resumeModules.some((module) => module.id === "resume-asu")).toBe(true);
    expect(merged.resumeModules.length).toBe(seedResumeModules.length);
  });

  it("adds new seed job sources without overwriting user-added sources", () => {
    const state = createSeedState();
    state.jobSources = [
      {
        id: "source-user-custom",
        name: "Custom",
        url: "https://custom.example",
        kind: "manual",
        enabled: true,
        cadence: "manual"
      }
    ];

    const merged = mergeSeedDefaults(state).data;
    expect(merged.jobSources.some((source) => source.id === "source-user-custom")).toBe(true);
    expect(merged.jobSources.some((source) => source.id === "source-fixture-greenhouse")).toBe(true);
    expect(merged.jobSources.length).toBe(seedJobSources.length + 1);
  });

  it("tracks newly merged starter source ids for announcement", () => {
    const state = createSeedState();
    state.jobSources = state.jobSources.filter(
      (source) => source.id !== "source-qualcomm-workday-cxs" && source.id !== "source-viasat-icims"
    );
    const { addedStarterSourceIds } = mergeSeedDefaults(state);
    expect(addedStarterSourceIds).toContain("source-qualcomm-workday-cxs");
    expect(addedStarterSourceIds).toContain("source-viasat-icims");
  });
});

describe("hydrateState", () => {
  it("syncs drifted applicationStatus to card.state", () => {
    const card = createCareerApplicationCard({
      company: "Acme",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software",
      applicationStatus: "inbox"
    });
    card.state = "waiting";
    card.careerApplication!.applicationStatus = "inbox";

    const hydrated = hydrateState(
      {
        ...createSeedState(),
        cards: [card]
      },
      new Date("2026-06-09T12:00:00.000Z")
    );

    expect(hydrated.cards[0].state).toBe("waiting");
    expect(hydrated.cards[0].careerApplication?.applicationStatus).toBe("waiting");
  });

  it("resets interrupted running job sources to error", () => {
    const state = createSeedState();
    state.jobSources = state.jobSources.map((source) =>
      source.id === "source-fixture-greenhouse"
        ? { ...source, runStatus: "running", lastRunMessage: "Running..." }
        : source
    );

    const hydrated = hydrateState(state, new Date("2026-06-09T12:00:00.000Z"));
    const fixture = hydrated.jobSources.find((source) => source.id === "source-fixture-greenhouse");
    expect(fixture?.runStatus).toBe("error");
    expect(fixture?.lastRunMessage).toBe(RUN_INTERRUPTED_MESSAGE);
  });

  it("resets daily flags on day rollover", () => {
    const state = createSeedState();
    state.dailyState = {
      ...state.dailyState,
      date: "2026-06-08",
      pounceStarted: true,
      minimumViableDayCompleted: true,
      salvageCompleted: true
    };

    const hydrated = hydrateState(state, new Date("2026-06-09T12:00:00.000Z"));
    expect(hydrated.dailyState.date).toBe("2026-06-09");
    expect(hydrated.dailyState.pounceStarted).toBe(false);
    expect(hydrated.dailyState.minimumViableDayCompleted).toBe(false);
    expect(hydrated.dailyState.salvageCompleted).toBe(false);
  });

  it("repairs one-sided candidate to card link", () => {
    const card = createCareerApplicationCard({
      company: "Acme",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software"
    });
    const candidateId = "candidate-link-test";
    card.careerApplication!.jobCandidateId = candidateId;

    const state = createSeedState();
    state.cards = [card];
    state.jobCandidates = [
      {
        id: candidateId,
        company: "Acme",
        roleTitle: "Engineer",
        description: "Build things",
        roleType: "software",
        discoveredAt: "2026-06-09T12:00:00.000Z",
        origin: "manual",
        status: "saved",
        fitScore: 50,
        fitReasons: [],
        gaps: [],
        suggestedResumeModuleIds: [],
        nextTinyAction: "Review."
      }
    ];

    const hydrated = hydrateState(state, new Date("2026-06-09T12:00:00.000Z"));
    expect(hydrated.jobCandidates[0].applicationCardId).toBe(card.id);
  });
});

describe("preparePersistedState", () => {
  it("handles partial legacy snapshot missing jobSourceRuns", () => {
    const partial = {
      cards: createSeedState().cards,
      logs: [],
      proofItems: [],
      dailyState: createSeedState().dailyState,
      resumeModules: createSeedState().resumeModules,
      jobCandidates: [],
      jobSources: createSeedState().jobSources
    };

    const prepared = preparePersistedState(partial, new Date("2026-06-09T12:00:00.000Z"));
    expect(prepared.jobSourceRuns).toEqual([]);
  });
});
