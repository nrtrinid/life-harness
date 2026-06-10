import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { seedCards, seedLogs } from "../data/seed";
import { seedJobCandidates, seedResumeModules } from "../data/seedJobScout";
import {
  AUTO_COMPACT_THRESHOLD_CHARS,
  buildCompactHarnessContext,
  buildContextQualitySummary,
  buildHarnessContext,
  buildHarnessBoardDiagnosis,
  countCardsByArea,
  countCardsByState,
  countCardsByWarmth,
  DEFAULT_COMPACT_MAX_CONTEXT_CHARS,
  estimateHarnessContextChars,
  getActiveLimitSignal,
  getColdOrDormantCards,
  HARNESS_STATIC_DECISIONS,
  mapLogType,
  scoreCompactCardPriority,
  type HarnessExportInput
} from "./harnessContext";
import { CHAT_MEMORY_ANALYSIS_PREFIX } from "./harnessMemory";
import type { HarnessChatSummary } from "./types";

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

describe("buildCompactHarnessContext", () => {
  it("estimateHarnessContextChars matches JSON.stringify length", () => {
    const context = buildHarnessContext(baseInput());
    expect(estimateHarnessContextChars(context)).toBe(JSON.stringify(context).length);
  });

  it("seed compact export fits under the default budget", () => {
    const compact = buildCompactHarnessContext(baseInput());
    expect(estimateHarnessContextChars(compact)).toBeLessThanOrEqual(DEFAULT_COMPACT_MAX_CONTEXT_CHARS);
  });

  it("compact export is smaller than full when resume modules are present", () => {
    const full = buildHarnessContext(baseInput());
    const compact = buildCompactHarnessContext(baseInput());

    expect(estimateHarnessContextChars(full)).toBeGreaterThan(estimateHarnessContextChars(compact));
    expect(full.cards.some((card) => card.title.startsWith("Resume:"))).toBe(true);
    expect(compact.cards.every((card) => !card.title.startsWith("Resume:"))).toBe(true);
  });

  it("preserves recent analyses after compact export", () => {
    const compact = buildCompactHarnessContext(baseInput());
    expect(compact.recent_analyses.length).toBeGreaterThanOrEqual(2);
    expect(compact.recent_analyses[0]?.summary).toMatch(/diagnosis/i);
  });

  it("preserves active and waiting card titles", () => {
    const full = buildHarnessContext(baseInput());
    const compact = buildCompactHarnessContext(baseInput());
    const keepStates = new Set(["Active", "Waiting"]);

    for (const card of full.cards.filter((item) => keepStates.has(item.state))) {
      expect(compact.cards.some((item) => item.title === card.title)).toBe(true);
    }
  });

  it("preserves career signals after compact export", () => {
    const compact = buildCompactHarnessContext(baseInput());

    expect(compact.cards.some((card) => card.area === "Social / Career")).toBe(true);
    expect(
      compact.recent_analyses.some((item) => item.summary.toLowerCase().includes("career"))
    ).toBe(true);
  });

  it("preserves cold or dormant signal after compact export", () => {
    const compact = buildCompactHarnessContext(baseInput());

    expect(
      compact.recent_analyses.some((item) =>
        item.patterns_detected.some((pattern) => pattern.toLowerCase().includes("cold"))
      ) || compact.cards.some((card) => card.warmth === "Cold" || card.warmth === "Dormant")
    ).toBe(true);
  });

  it("drops resume cards before active cards when forced to trim further", () => {
    expect(scoreCompactCardPriority({ title: "Resume: Test", area: "Build", state: "Parked", progress: 0, warmth: "Dormant", next_tiny_action: "x", why_it_matters: "y" })).toBeLessThan(
      scoreCompactCardPriority({ title: "Active card", area: "Build", state: "Active", progress: 0, warmth: "Hot", next_tiny_action: "x", why_it_matters: "y" })
    );

    const compact = buildCompactHarnessContext(baseInput(), { maxContextChars: 3_500 });
    expect(compact.cards.every((card) => !card.title.startsWith("Resume:"))).toBe(true);
    expect(compact.cards.some((card) => card.state === "Active")).toBe(true);
  });

  it("returns full export unchanged when already under the budget without resume modules", () => {
    const input: HarnessExportInput = {
      cards: structuredClone(seedCards),
      logs: structuredClone(seedLogs),
      proofItems: [],
      dailyState: createSeedState().dailyState
    };
    const full = buildHarnessContext(input);
    const compact = buildCompactHarnessContext(input);

    expect(estimateHarnessContextChars(full)).toBeLessThanOrEqual(AUTO_COMPACT_THRESHOLD_CHARS);
    expect(compact).toEqual(full);
  });

  it("does not mutate the input object", () => {
    const input = baseInput();
    const before = JSON.stringify(input);
    buildCompactHarnessContext(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

function fixtureChatSummary(overrides: Partial<HarnessChatSummary> = {}): HarnessChatSummary {
  return {
    id: "chat-memory-fixture",
    createdAt: "2026-06-09T13:00:00.000Z",
    mode: "operator",
    userMessage: "What am I avoiding right now?",
    assistantSummary: "Career thread looks cold while Build stays hot.",
    patterns: ["career avoidance", "build-heavy momentum"],
    decisions: ["Next step: send one tiny career follow-up."],
    suggestedNextActions: ["Review the candidate queue."],
    rememberForNextTime: ["User asked about avoidance."],
    ...overrides
  };
}

describe("chat summary export", () => {
  it("does not throw when chatSummaries are omitted", () => {
    const context = buildHarnessContext(baseInput());
    expect(context.recent_analyses.every((item) => !item.summary.startsWith(CHAT_MEMORY_ANALYSIS_PREFIX))).toBe(
      true
    );
  });

  it("includes chat summaries as recent_analyses", () => {
    const context = buildHarnessContext(
      baseInput({
        chatSummaries: [fixtureChatSummary()]
      })
    );

    expect(
      context.recent_analyses.some((item) => item.summary.startsWith(CHAT_MEMORY_ANALYSIS_PREFIX))
    ).toBe(true);
  });

  it("includes chat decisions in export decisions", () => {
    const context = buildHarnessContext(
      baseInput({
        chatSummaries: [fixtureChatSummary()]
      })
    );

    expect(context.decisions.some((item) => item.summary.includes("career follow-up"))).toBe(true);
  });

  it("compact export retains at least one chat memory analysis", () => {
    const context = buildCompactHarnessContext(
      baseInput({
        chatSummaries: [fixtureChatSummary()]
      })
    );

    expect(
      context.recent_analyses.some((item) => item.summary.startsWith(CHAT_MEMORY_ANALYSIS_PREFIX))
    ).toBe(true);
  });

  it("does not mutate export input when chat summaries are present", () => {
    const input = baseInput({
      chatSummaries: [fixtureChatSummary()]
    });
    const before = JSON.stringify(input);
    buildHarnessContext(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
