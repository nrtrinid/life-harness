import { describe, expect, it } from "vitest";

import type { LifeHarnessData } from "../../core/lifeHarnessData";
import { createSeedState } from "../../data/createSeedState";
import type { StorageAdapter } from "../../storage/types";
import {
  clearLifeHarnessPersistence,
  createLifeHarnessEnvelope,
  hydrateLifeHarnessState,
  parseLifeHarnessImport,
  persistLifeHarnessState,
  serializeLifeHarnessSnapshot
} from "./persistence";

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

describe("lifeHarness persistence boundary", () => {
  const fixedNow = new Date("2026-06-09T12:00:00.000Z");

  it("hydrates clean bootstrap when snapshot is missing", () => {
    const adapter = createMockAdapter();
    const hydrated = hydrateLifeHarnessState(adapter, fixedNow);

    expect(hydrated.cards).toEqual([]);
    expect(hydrated.jobSourceRuns).toEqual([]);
  });

  it("hydrates valid persisted snapshot", () => {
    const adapter = createMockAdapter();
    const state = createStateWithRun();
    persistLifeHarnessState(state, adapter);

    const hydrated = hydrateLifeHarnessState(adapter, fixedNow);
    expect(hydrated.jobSourceRuns).toEqual(state.jobSourceRuns);
    expect(hydrated.jobCandidates.some((item) => item.id === "candidate-test")).toBe(true);
  });

  it("falls back to clean bootstrap when stored snapshot JSON is invalid", () => {
    const adapter = createMockAdapter("{bad");
    const hydrated = hydrateLifeHarnessState(adapter, fixedNow);

    expect(hydrated.jobSourceRuns).toEqual([]);
    expect(hydrated.cards).toEqual([]);
  });

  it("falls back to seed when stored snapshot schema is incompatible", () => {
    const adapter = createMockAdapter(
      JSON.stringify({
        schemaVersion: 99,
        savedAt: "2026-06-09T12:00:00.000Z",
        data: createSeedState("2026-06-09T12:00:00.000Z")
      })
    );
    const hydrated = hydrateLifeHarnessState(adapter, fixedNow);

    expect(hydrated.jobSourceRuns).toEqual([]);
  });

  it("persists snapshot JSON to adapter", () => {
    const adapter = createMockAdapter();
    const state = createStateWithRun();
    persistLifeHarnessState(state, adapter);

    expect(adapter.stored).not.toBeNull();
    expect(adapter.stored).toContain('"schemaVersion": 1');
  });

  it("clears persisted snapshot so hydrate returns clean bootstrap", () => {
    const adapter = createMockAdapter();
    persistLifeHarnessState(createStateWithRun(), adapter);
    clearLifeHarnessPersistence(adapter);

    expect(adapter.stored).toBeNull();
    const hydrated = hydrateLifeHarnessState(adapter, fixedNow);
    expect(hydrated.jobSourceRuns).toEqual([]);
  });

  it("parseLifeHarnessImport rejects invalid JSON", () => {
    const result = parseLifeHarnessImport("{not json", fixedNow);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid JSON");
  });

  it("serializeLifeHarnessSnapshot produces parseable envelope", () => {
    const state = createStateWithRun();
    const json = serializeLifeHarnessSnapshot(state);
    const parsed = parseLifeHarnessImport(json, fixedNow);

    expect(parsed.ok).toBe(true);
    expect(createLifeHarnessEnvelope(state).schemaVersion).toBe(1);
    expect(parsed.data?.jobSourceRuns).toEqual(state.jobSourceRuns);
  });
});
