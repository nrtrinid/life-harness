import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { applyImportCareerSourcePack } from "../core/actions";
import type { LifeHarnessData } from "../core/lifeHarnessData";
import { createSeedState } from "../data/createSeedState";
import {
  createEnvelope,
  loadPersistedState,
  parseImportJson,
  savePersistedState,
  serializeEnvelope
} from "./persistence";
import type { StorageAdapter } from "./types";

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
