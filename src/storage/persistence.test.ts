import { describe, expect, it } from "vitest";

import type { LifeHarnessData } from "../core/lifeHarnessData";
import { createCareerApplicationCard } from "../core/career";
import { applyImportCareerSourcePack } from "../core/actions";
import { createSeedState } from "../data/createSeedState";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { seedJobSources, seedResumeModules } from "../data/seedJobScout";
import { seedCards } from "../data/seed";
import {
  createEnvelope,
  hydrateState,
  loadPersistedState,
  mergeSeedDefaults,
  normalizeData,
  parseImportJson,
  preparePersistedState,
  savePersistedState,
  serializeEnvelope
} from "./persistence";
import { RUN_INTERRUPTED_MESSAGE, type StorageAdapter } from "./types";

function createMockAdapter(initial: string | null = null): StorageAdapter & { readonly stored: string | null } {
  const bucket = { stored: initial };
  return {
    get stored() {
      return bucket.stored;
    },
    isAvailable: () => true,
    loadRaw: () => bucket.stored,
    saveRaw: (json: string) => {
      bucket.stored = json;
    },
    clear: () => {
      bucket.stored = null;
    }
  };
}

function createStateWithRun(): LifeHarnessData {
  const state = structuredClone(createSeedState("2026-06-09T12:00:00.000Z"));
  state.jobSourceRuns = [
    {
      sourceId: "source-fixture-greenhouse",
      fetchedAt: "2026-06-09T12:00:00.000Z",
      createdCandidateIds: ["candidate-test"],
      skippedDuplicates: 0,
      errors: [],
      message: "Fetched 1 candidate."
    }
  ];
  state.jobCandidates = [
    {
      id: "candidate-test",
      company: "Test Co",
      roleTitle: "Engineer",
      description: "Python TypeScript security",
      roleType: "software",
      discoveredAt: "2026-06-09T12:00:00.000Z",
      origin: "source_fetch",
      status: "new",
      fitScore: 50,
      fitReasons: ["test"],
      gaps: [],
      suggestedResumeModuleIds: [],
      nextTinyAction: "Review fit."
    },
    ...state.jobCandidates
  ];
  return state;
}

describe("career source pack persistence", () => {
  const packFixture = readFileSync(
    join(process.cwd(), "public/fixtures/sample-career-source-pack.v1.json"),
    "utf8"
  );

  it("round-trips imported career pack", () => {
    const imported = applyImportCareerSourcePack(createSeedState(), packFixture);
    expect(imported.ok).toBe(true);
    const json = serializeEnvelope(imported.state);
    const parsed = parseImportJson(json, new Date("2026-06-09T12:00:00.000Z"));
    expect(parsed.ok).toBe(true);
    expect(parsed.data?.careerSourcePack?.pack.resumeModules.length).toBeGreaterThan(0);
  });

  it("hydrates old snapshots with careerSourcePack null", () => {
    const state = createSeedState();
    const { careerSourcePack: _removed, ...withoutPack } = state;
    const normalized = normalizeData(withoutPack);
    expect(normalized.careerSourcePack).toBeNull();
  });
});

describe("schema v1 round trip", () => {
  it("serializes and parses back to equivalent data", () => {
    const state = createStateWithRun();
    const json = serializeEnvelope(state);
    const parsed = parseImportJson(json, new Date("2026-06-09T12:00:00.000Z"));

    expect(parsed.ok).toBe(true);
    expect(parsed.data?.jobCandidates.length).toBe(state.jobCandidates.length);
    expect(parsed.data?.jobSourceRuns).toEqual(state.jobSourceRuns);
  });

  it("createEnvelope includes schemaVersion and savedAt", () => {
    const envelope = createEnvelope(createSeedState());
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

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
});

describe("mergeSeedDefaults", () => {
  it("preserves user-edited job source fields", () => {
    const state = createSeedState();
    const editedUrl = "https://user-edited.example/jobs";
    state.jobSources = state.jobSources.map((source) =>
      source.id === "source-microsoft" ? { ...source, url: editedUrl, enabled: true } : source
    );

    const merged = mergeSeedDefaults(state);
    const microsoft = merged.jobSources.find((source) => source.id === "source-microsoft");
    expect(microsoft?.url).toBe(editedUrl);
    expect(microsoft?.enabled).toBe(true);
  });

  it("adds new seed resume modules without overwriting existing ones", () => {
    const state = createSeedState();
    state.resumeModules = state.resumeModules.filter((module) => module.id !== "resume-asu");

    const merged = mergeSeedDefaults(state);
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

    const merged = mergeSeedDefaults(state);
    expect(merged.jobSources.some((source) => source.id === "source-user-custom")).toBe(true);
    expect(merged.jobSources.some((source) => source.id === "source-fixture-greenhouse")).toBe(true);
    expect(merged.jobSources.length).toBe(seedJobSources.length + 1);
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

describe("parseImportJson", () => {
  it("rejects invalid JSON", () => {
    const result = parseImportJson("{not json");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid JSON");
  });

  it("rejects unsupported schema versions", () => {
    const result = parseImportJson(
      JSON.stringify({
        schemaVersion: 99,
        savedAt: "2026-06-09T12:00:00.000Z",
        data: createSeedState()
      })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unsupported schema version");
  });

  it("rejects envelopes missing data", () => {
    const result = parseImportJson(
      JSON.stringify({
        schemaVersion: 1,
        savedAt: "2026-06-09T12:00:00.000Z"
      })
    );
    expect(result.ok).toBe(false);
  });
});

describe("export/import round trip", () => {
  it("preserves job candidates and source runs", () => {
    const state = createStateWithRun();
    const imported = parseImportJson(serializeEnvelope(state), new Date("2026-06-09T12:00:00.000Z"));
    expect(imported.ok).toBe(true);
    expect(imported.data?.jobSourceRuns).toHaveLength(1);
    expect(imported.data?.jobCandidates.some((item) => item.id === "candidate-test")).toBe(true);
  });

  it("preserves requestConfig on job sources", () => {
    const state = createSeedState("2026-06-09T12:00:00.000Z");
    const requestConfig = {
      method: "POST" as const,
      bodyJson: { appliedFacets: {}, limit: 20, offset: 0, searchText: "" },
      pagination: { mode: "workday_offset" as const, limit: 20, maxPages: 3 }
    };
    state.jobSources = [
      {
        id: "source-workday-endpoint",
        name: "Workday Endpoint Fixture",
        url: "/fixtures/sample-workday-cxs-response.json",
        kind: "workday",
        enabled: true,
        cadence: "manual",
        requestConfig
      }
    ];
    const imported = parseImportJson(serializeEnvelope(state), new Date("2026-06-09T12:00:00.000Z"));
    expect(imported.ok).toBe(true);
    expect(imported.data?.jobSources[0]?.requestConfig).toEqual(requestConfig);
  });
});

describe("createSeedState", () => {
  it("returns expected seed card ids and empty run history", () => {
    const state = createSeedState("2026-06-09T12:00:00.000Z");
    expect(state.jobSourceRuns).toEqual([]);
    expect(state.cards.map((card) => card.id).sort()).toEqual(seedCards.map((card) => card.id).sort());
  });
});

describe("load and save via adapter", () => {
  it("round trips through mock adapter", () => {
    const adapter = createMockAdapter();
    const state = createStateWithRun();
    savePersistedState(state, adapter);
    expect(adapter.stored).not.toBeNull();

    const loaded = loadPersistedState(adapter, new Date("2026-06-09T12:00:00.000Z"));
    expect(loaded?.jobSourceRuns).toEqual(state.jobSourceRuns);
  });

  it("returns null when adapter is unavailable", () => {
    const adapter: StorageAdapter = {
      isAvailable: () => false,
      loadRaw: () => "should-not-read",
      saveRaw: () => {},
      clear: () => {}
    };
    expect(loadPersistedState(adapter)).toBeNull();
  });

  it("returns null for corrupt stored snapshot", () => {
    const adapter = createMockAdapter("{bad");
    expect(loadPersistedState(adapter)).toBeNull();
  });
});

describe("invalid import leaves state unchanged", () => {
  it("parseImportJson failure does not produce data", () => {
    const before = createSeedState();
    const result = parseImportJson("{", new Date("2026-06-09T12:00:00.000Z"));
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(before.cards.length).toBeGreaterThan(0);
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
