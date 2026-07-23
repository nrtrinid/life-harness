import { describe, expect, it } from "vitest";

import {
  createMemoryItem,
  getMemoryRetrievalEligibility,
  MEMORY_SENSITIVITY_LEVELS
} from "../../core/harnessMemoryBank";
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

  it("round-trips every explicit Memory Bank sensitivity without rewriting it", () => {
    const adapter = createMockAdapter();
    const state = createStateWithRun();
    state.memoryItems = MEMORY_SENSITIVITY_LEVELS.map((sensitivity) =>
      createMemoryItem(
        {
          id: `memory-${sensitivity}`,
          kind: "pattern",
          title: `Memory ${sensitivity}`,
          summary: `Persist ${sensitivity} exactly.`,
          tags: ["persistence"],
          sensitivity,
          isActive: true
        },
        "2026-06-09T12:00:00.000Z"
      )
    );

    persistLifeHarnessState(state, adapter);
    const hydrated = hydrateLifeHarnessState(adapter, fixedNow);
    const serialized = JSON.parse(adapter.stored!) as {
      data: { memoryItems: Array<{ sensitivity: string }> };
    };

    expect(hydrated.memoryItems.map((item) => item.sensitivity)).toEqual([
      "S0",
      "S1",
      "S2",
      "S3"
    ]);
    expect(serialized.data.memoryItems.map((item) => item.sensitivity)).toEqual([
      "S0",
      "S1",
      "S2",
      "S3"
    ]);
  });

  it("hydrates missing and invalid legacy sensitivity as unclassified without data loss", () => {
    const base = createMemoryItem(
      {
        id: "memory-legacy",
        kind: "rule",
        title: "Legacy rule",
        summary: "Keep this record available.",
        tags: ["legacy"],
        sourceChatSummaryId: "chat-legacy",
        sensitivity: "S2",
        isActive: true
      },
      "2026-06-09T12:00:00.000Z"
    );
    const { sensitivity: _missing, ...legacy } = base;
    const invalid = {
      ...base,
      id: "memory-invalid",
      title: "Invalid classification",
      sensitivity: "private"
    };
    const adapter = createMockAdapter(
      JSON.stringify({
        schemaVersion: 1,
        savedAt: "2026-06-09T12:00:00.000Z",
        data: {
          ...createStateWithRun(),
          memoryItems: [legacy, invalid]
        }
      })
    );

    const hydrated = hydrateLifeHarnessState(adapter, fixedNow);

    expect(hydrated.memoryItems).toHaveLength(2);
    expect(hydrated.memoryItems[0]).toMatchObject({
      id: "memory-legacy",
      title: "Legacy rule",
      summary: "Keep this record available.",
      tags: ["legacy"],
      sourceChatSummaryId: "chat-legacy",
      sensitivity: "unclassified"
    });
    expect(hydrated.memoryItems[1]).toMatchObject({
      id: "memory-invalid",
      title: "Invalid classification",
      sensitivity: "unclassified"
    });
    expect(
      hydrated.memoryItems.map((item) => getMemoryRetrievalEligibility(item).reason)
    ).toEqual(["sensitivity_unclassified", "sensitivity_unclassified"]);
    const stored = JSON.parse(adapter.stored!) as {
      data: { memoryItems: Array<{ sensitivity?: string }> };
    };
    expect(stored.data.memoryItems[0]?.sensitivity).toBeUndefined();
    expect(stored.data.memoryItems[1]?.sensitivity).toBe("private");
  });
});
