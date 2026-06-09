import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { seedJobCandidates, seedResumeModules } from "../data/seedJobScout";
import {
  buildHarnessContext,
  HARNESS_STATIC_DECISIONS,
  mapLogType,
  type HarnessExportInput
} from "./harnessContext";

function baseInput(overrides: Partial<HarnessExportInput> = {}): HarnessExportInput {
  const seed = createSeedState("2026-06-09T12:00:00.000Z");
  return {
    cards: seed.cards,
    logs: seed.logs,
    proofItems: seed.proofItems,
    dailyState: seed.dailyState,
    resumeModules: seed.resumeModules,
    jobCandidates: seed.jobCandidates,
    ...overrides
  };
}

describe("buildHarnessContext", () => {
  it("exports life cards with ai-gateway enum label strings", () => {
    const context = buildHarnessContext(baseInput());
    const buildCard = context.cards.find((card) => card.title.includes("Life Harness"));

    expect(buildCard).toBeDefined();
    expect(buildCard?.area).toBe("Build");
    expect(buildCard?.state).toBe("Active");
    expect(buildCard?.warmth).toBe("Hot");
  });

  it("includes proof items when available", () => {
    const context = buildHarnessContext(baseInput());
    expect(context.proof_items.length).toBeGreaterThan(0);
    expect(context.proof_items[0]?.summary).toBeTruthy();
  });

  it("includes static system decisions", () => {
    const context = buildHarnessContext(baseInput());
    expect(context.decisions.length).toBeGreaterThanOrEqual(4);
    expect(context.decisions).toEqual(expect.arrayContaining(HARNESS_STATIC_DECISIONS));
  });

  it("adds synthetic cards for job candidates when provided", () => {
    const candidate = structuredClone(seedJobCandidates[0]);
    candidate.status = "saved";
    candidate.applicationCardId = undefined;

    const context = buildHarnessContext(
      baseInput({
        jobCandidates: [candidate]
      })
    );

    expect(context.cards.some((card) => card.title.includes(candidate.company))).toBe(true);
  });

  it("adds synthetic cards for active resume modules when provided", () => {
    const module = structuredClone(seedResumeModules[0]);
    const context = buildHarnessContext(
      baseInput({
        resumeModules: [module]
      })
    );

    expect(context.cards.some((card) => card.title.startsWith("Resume:"))).toBe(true);
  });

  it("does not throw when optional v0.2 fields are omitted", () => {
    const context = buildHarnessContext({
      cards: baseInput().cards,
      logs: baseInput().logs,
      proofItems: baseInput().proofItems,
      dailyState: baseInput().dailyState
    });

    expect(context.cards.length).toBeGreaterThan(0);
    expect(context.recent_analyses).toEqual([]);
  });

  it("does not mutate the input object", () => {
    const input = baseInput();
    const before = JSON.stringify(input);
    buildHarnessContext(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("maps idea logs to note for the gateway", () => {
    expect(mapLogType("idea")).toBe("note");
  });
});
