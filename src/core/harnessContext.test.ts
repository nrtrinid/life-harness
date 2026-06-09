import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { seedCards, seedLogs } from "../data/seed";
import { seedJobCandidates, seedResumeModules } from "../data/seedJobScout";
import {
  buildContextQualitySummary,
  buildHarnessContext,
  buildHarnessBoardDiagnosis,
  countCardsByArea,
  countCardsByState,
  countCardsByWarmth,
  getActiveLimitSignal,
  getColdOrDormantCards,
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
    jobSourceRuns: seed.jobSourceRuns,
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
    for (const decision of HARNESS_STATIC_DECISIONS) {
      expect(context.decisions).toEqual(expect.arrayContaining([decision]));
    }
  });

  it("includes dynamic decisions for active limit and read-only AI", () => {
    const context = buildHarnessContext(baseInput());
    expect(
      context.decisions.some((decision) =>
        decision.summary.includes("read-only")
      )
    ).toBe(true);
    expect(
      context.decisions.some((decision) =>
        decision.summary.includes("over the active limit")
      )
    ).toBe(true);
  });

  it("includes board diagnosis in recent_analyses", () => {
    const context = buildHarnessContext(baseInput());
    expect(context.recent_analyses.length).toBeGreaterThanOrEqual(2);
    expect(context.recent_analyses[0]?.summary).toMatch(/diagnosis/i);
  });

  it("active limit diagnosis appears when active count exceeds limit", () => {
    const analyses = buildHarnessBoardDiagnosis(baseInput());
    const activeSignal = getActiveLimitSignal(baseInput());

    expect(activeSignal.isOverLimit).toBe(true);
    expect(analyses.some((item) => item.summary.includes("Active limit"))).toBe(true);
  });

  it("cold or dormant cards appear in diagnosis", () => {
    const context = buildHarnessContext(baseInput());
    expect(
      context.recent_analyses.some((item) =>
        item.patterns_detected.some((pattern) => pattern.toLowerCase().includes("cold"))
      )
    ).toBe(true);
  });

  it("caps logs newest-first", () => {
    const manyLogs = Array.from({ length: 40 }, (_, index) => ({
      ...structuredClone(seedLogs[0]),
      id: `log-${index}`,
      cardId: undefined,
      timestamp: new Date(Date.UTC(2026, 5, 1, index)).toISOString(),
      rawText: `Log ${index}`
    }));

    const context = buildHarnessContext({
      cards: [],
      logs: manyLogs,
      proofItems: [],
      dailyState: {
        date: "2026-06-01",
        mode: "normal",
        pounceStarted: false,
        minimumViableDayCompleted: false,
        salvageCompleted: false
      }
    });

    expect(context.logs.length).toBeLessThanOrEqual(30);
    expect(context.logs[0]?.summary).toContain("Log 39");
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

    const exported = context.cards.find((card) => card.title.includes(candidate.company));
    expect(exported).toBeDefined();
    expect(exported?.state).toBe("Inbox");
    expect(exported?.next_tiny_action).toBe("Review fit and approve or dismiss.");
  });

  it("adds synthetic cards for active resume modules when provided", () => {
    const module = structuredClone(seedResumeModules[0]);
    const context = buildHarnessContext(
      baseInput({
        resumeModules: [module]
      })
    );

    const exported = context.cards.find((card) => card.title.startsWith("Resume:"));
    expect(exported).toBeDefined();
    expect(exported?.state).toBe("Parked");
    expect(exported?.next_tiny_action).toBe(
      "Use this module when tailoring a matching application."
    );
  });

  it("does not throw when optional v0.2 fields are omitted", () => {
    const context = buildHarnessContext({
      cards: baseInput().cards,
      logs: baseInput().logs,
      proofItems: baseInput().proofItems,
      dailyState: baseInput().dailyState
    });

    expect(context.cards.length).toBeGreaterThan(0);
    expect(context.recent_analyses.length).toBeGreaterThan(0);
  });

  it("skips candidate and resume synthetic cards when optional arrays absent", () => {
    const cards = structuredClone(seedCards);
    const context = buildHarnessContext({
      cards,
      logs: structuredClone(seedLogs),
      proofItems: [],
      dailyState: createSeedState().dailyState
    });

    expect(context.cards.length).toBe(cards.length);
    expect(context.cards.every((card) => !card.title.startsWith("Resume:"))).toBe(true);
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

  it("context quality helpers summarize exported context", () => {
    const input = baseInput();
    const context = buildHarnessContext(input);
    const activeSignal = getActiveLimitSignal(input);

    expect(countCardsByState(context).Active).toBeGreaterThan(0);
    expect(countCardsByArea(context).Build).toBeGreaterThan(0);
    expect(countCardsByWarmth(context).Hot).toBeGreaterThan(0);
    expect(getColdOrDormantCards(context).length).toBeGreaterThan(0);

    const summary = buildContextQualitySummary(context, activeSignal);
    expect(summary).toContain("Cards ");
    expect(summary).toContain("Active limit exceeded");
  });
});
