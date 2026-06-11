import { describe, expect, it } from "vitest";

import {
  DEFAULT_GATEWAY_MAX_INPUT_CHARS,
  DEFAULT_RAW_LAB_MAX_INPUT_CHARS
} from "./gatewayBudget";
import {
  COMPANION_SELF_MEMORY_INJECTION_CAP_AGGRESSIVE,
  createCompanionSelfMemory
} from "./companionSelfMemory";
import {
  buildRawLabSendBundle,
  buildRawLabSmartCompactedContext,
  compactRawLabThreadStateForBudget,
  estimateRawLabSerializedInputChars,
  RAW_LAB_PROMPT_SHELL_CHARS,
  RAW_LAB_SEND_BUDGET_SAFETY_MARGIN
} from "./rawLabContextBudget";
import {
  createEmptyRawLabPersonalityState,
  createEmptyRawLabThreadState,
  type RawLabTurn
} from "./rawLabThreadState";

function makeTurn(role: "user" | "assistant", content: string): RawLabTurn {
  return {
    id: `turn-${content.slice(0, 8)}`,
    role,
    content,
    createdAt: "2026-01-01T00:00:00Z"
  };
}

describe("estimateRawLabSerializedInputChars", () => {
  it("includes companion self-memories JSON length", () => {
    const created = createCompanionSelfMemory({
      kind: "self_observation",
      text: "Initiative pattern",
      source: "manual_user_teaching"
    });
    if (!created.ok) {
      throw new Error("expected memory");
    }
    const without = estimateRawLabSerializedInputChars({
      message: "hi",
      recentTurns: [],
      threadState: createEmptyRawLabThreadState()
    });
    const withMemory = estimateRawLabSerializedInputChars({
      message: "hi",
      recentTurns: [],
      threadState: createEmptyRawLabThreadState(),
      companionSelfMemories: [
        {
          id: created.memory.id,
          kind: created.memory.kind,
          subject: created.memory.subject,
          scope: created.memory.scope,
          text: created.memory.text,
          confidence: created.memory.confidence,
          sensitivity: created.memory.sensitivity
        }
      ]
    });
    expect(withMemory).toBeGreaterThan(without);
  });

  it("includes system prompt shell reserve", () => {
    const estimate = estimateRawLabSerializedInputChars({
      message: "hi",
      recentTurns: [],
      threadState: createEmptyRawLabThreadState()
    });
    expect(estimate).toBeGreaterThanOrEqual(RAW_LAB_PROMPT_SHELL_CHARS);
  });
});

describe("compactRawLabThreadStateForBudget", () => {
  it("caps personality and growth notes at aggressive level", () => {
    const state = createEmptyRawLabThreadState();
    state.recurringTopics = ["a", "b", "c", "d"];
    state.currentVibe = "Current vibe ".repeat(40);
    state.provisionalStances = ["s1", "s2", "s3"];
    state.selfObservations = ["o1", "o2", "o3"];
    state.questionsToRevisit = ["q1", "q2", "q3"];
    state.personality = {
      ...createEmptyRawLabPersonalityState(),
      voiceTraits: ["a", "b", "c", "d"],
      growthNotes: ["one", "two", "three"]
    };
    const compacted = compactRawLabThreadStateForBudget({
      state,
      level: "aggressive"
    });
    expect(compacted.recurringTopics.length).toBeLessThanOrEqual(2);
    expect(compacted.currentVibe.length).toBeLessThanOrEqual(90);
    expect(compacted.provisionalStances.length).toBeLessThanOrEqual(1);
    expect(compacted.selfObservations.length).toBeLessThanOrEqual(1);
    expect(compacted.questionsToRevisit.length).toBeLessThanOrEqual(2);
    expect(compacted.personality.voiceTraits.length).toBeLessThanOrEqual(2);
    expect(compacted.personality.growthNotes.length).toBeLessThanOrEqual(1);
  });

  it("does not mutate the original state", () => {
    const state = createEmptyRawLabThreadState();
    state.openLoops = ["loop-a", "loop-b", "loop-c", "loop-d", "loop-e"];
    const before = [...state.openLoops];
    compactRawLabThreadStateForBudget({ state, level: "compact_state" });
    expect(state.openLoops).toEqual(before);
  });

  it("preserves latest steering and core loops before personality flavor", () => {
    const state = createEmptyRawLabThreadState();
    state.openLoops = ["loop-a", "loop-b", "loop-c"];
    state.userSteering = ["old steering", "middle steering", "latest steering"];
    state.doNotRepeat = ["old phrase", "middle phrase", "latest phrase"];
    state.questionsToRevisit = ["question-a", "question-b", "question-c"];
    state.selfObservations = ["obs-a", "obs-b", "obs-c"];
    state.personality = {
      ...createEmptyRawLabPersonalityState(),
      voiceTraits: ["voice-a", "voice-b", "voice-c"],
      growthNotes: ["growth-a", "growth-b", "growth-c"]
    };
    const originalSteering = [...state.userSteering];

    const compacted = compactRawLabThreadStateForBudget({
      state,
      level: "aggressive"
    });

    expect(compacted.userSteering).toEqual(["middle steering", "latest steering"]);
    expect(compacted.doNotRepeat).toEqual(["middle phrase", "latest phrase"]);
    expect(compacted.openLoops).toEqual(["loop-a", "loop-b"]);
    expect(compacted.questionsToRevisit).toEqual(["question-a", "question-b"]);
    expect(compacted.selfObservations).toEqual(["obs-a"]);
    expect(compacted.personality.growthNotes).toEqual(["growth-a"]);
    expect(state.userSteering).toEqual(originalSteering);
  });

  it("builds deterministic smart compacted context from priority fields and recent turns", () => {
    const state = createEmptyRawLabThreadState();
    state.openLoops = ["loop-a", "loop-b", "loop-c"];
    state.questionsToRevisit = ["question-a", "question-b", "question-c"];
    state.userSteering = ["old steering", "middle steering", "latest steering"];
    state.doNotRepeat = ["old phrase", "middle phrase", "latest phrase"];
    state.recurringTopics = ["Raw Lab", "identity", "runtime"];
    state.provisionalStances = ["stance-a", "stance-b"];
    state.selfObservations = ["obs-a", "obs-b"];

    const turns = [
      makeTurn("user", "I want pushback on whether I am avoiding."),
      makeTurn("assistant", "Reply"),
      makeTurn("user", "Don't keep saying little scout.")
    ];

    const context = buildRawLabSmartCompactedContext({
      state,
      turns,
      level: "aggressive",
      turnsBefore: 10
    });

    expect(context.doNotRepeat).toEqual(["middle phrase", "latest phrase"]);
    expect(context.userSteering).toEqual(["middle steering", "latest steering"]);
    expect(context.activeOpenLoops).toEqual(["loop-a", "loop-b"]);
    expect(context.questionsToRevisit).toEqual(["question-a", "question-b"]);
    expect(context.recurringTopics).toEqual(["Raw Lab", "identity"]);
    expect(context.provisionalStances).toEqual(["stance-a"]);
    expect(context.selfObservations).toEqual(["obs-a"]);
    expect(context.importantRecentMoments).toEqual([
      "user: I want pushback on whether I am avoiding.",
      "user: Don't keep saying little scout."
    ]);
    expect(context.currentTension).toContain("avoidance");
    expect(context.discardedNoiseSummary).toContain("7 older Raw Lab turns");
    expect(context.sourceTurnIds).toEqual(["turn-I want p", "turn-Don't ke"]);
    expect(context.confidence).toBe(0.8);
  });
});

describe("buildRawLabSendBundle", () => {
  it("defaults to Raw Lab 32k cap, not Ask Harness 12k", () => {
    expect(DEFAULT_RAW_LAB_MAX_INPUT_CHARS).toBe(32_000);
    expect(DEFAULT_GATEWAY_MAX_INPUT_CHARS).toBe(18_000);
    const turns = Array.from({ length: 14 }, (_, index) =>
      makeTurn(index % 2 === 0 ? "user" : "assistant", `Mid turn ${index} `.repeat(90))
    );
    const bundleAt12k = buildRawLabSendBundle({
      message: "latest",
      turns,
      threadState: createEmptyRawLabThreadState(),
      maxInputChars: DEFAULT_GATEWAY_MAX_INPUT_CHARS
    });
    const bundleDefault = buildRawLabSendBundle({
      message: "latest",
      turns,
      threadState: createEmptyRawLabThreadState()
    });
    expect(bundleDefault.recentTurns.length).toBeGreaterThanOrEqual(bundleAt12k.recentTurns.length);
  });

  it("returns unchanged bundle when under budget", () => {
    const bundle = buildRawLabSendBundle({
      message: "hello",
      turns: [makeTurn("user", "Earlier")],
      threadState: createEmptyRawLabThreadState()
    });
    expect(bundle.notice).toBeUndefined();
    expect(bundle.level).toBe("none");
    expect(bundle.message).toBe("hello");
  });

  it("trims history when over budget", () => {
    const turns = Array.from({ length: 16 }, (_, index) =>
      makeTurn(index % 2 === 0 ? "user" : "assistant", `Long turn ${index} `.repeat(120))
    );
    const bundle = buildRawLabSendBundle({
      message: "latest",
      turns,
      threadState: createEmptyRawLabThreadState(),
      maxInputChars: DEFAULT_GATEWAY_MAX_INPUT_CHARS
    });
    expect(bundle.recentTurns.length).toBeLessThan(turns.length);
    expect(bundle.notice).toBeDefined();
    expect(bundle.estimatedChars).toBeLessThanOrEqual(
      DEFAULT_GATEWAY_MAX_INPUT_CHARS + RAW_LAB_SEND_BUDGET_SAFETY_MARGIN
    );
  });

  it("never changes the latest message", () => {
    const turns = Array.from({ length: 20 }, (_, index) =>
      makeTurn("assistant", `Verbose ${index} `.repeat(200))
    );
    const bundle = buildRawLabSendBundle({
      message: "keep this exact message",
      turns,
      threadState: createEmptyRawLabThreadState()
    });
    expect(bundle.message).toBe("keep this exact message");
  });

  it("slices companion self-memories when over budget", () => {
    const memories = Array.from({ length: 10 }, (_, index) => {
      const created = createCompanionSelfMemory({
        kind: "style_trait",
        text: `Memory ${index} `.repeat(20),
        source: "manual_user_teaching",
        confidence: index / 10
      });
      if (!created.ok) {
        throw new Error("expected memory");
      }
      return created.memory;
    });
    const bundle = buildRawLabSendBundle({
      message: "ok",
      turns: [],
      threadState: createEmptyRawLabThreadState(),
      companionSelfMemories: memories,
      maxInputChars: 8_000,
      forceAggressive: true
    });
    expect(bundle.companionSelfMemories.length).toBeLessThanOrEqual(
      COMPANION_SELF_MEMORY_INJECTION_CAP_AGGRESSIVE
    );
    expect(bundle.companionSelfMemories.length).toBeLessThan(memories.length);
  });

  it("compacts thread state when still over budget after trim", () => {
    const state = createEmptyRawLabThreadState();
    state.openLoops = ["a", "b", "c", "d", "e", "f", "g"];
    state.recurringTopics = ["r1", "r2", "r3", "r4", "r5"];
    state.personality.growthNotes = ["n1", "n2", "n3", "n4"];
    const turns = Array.from({ length: 18 }, (_, index) =>
      makeTurn("assistant", `Chunk ${index} `.repeat(150))
    );
    const bundle = buildRawLabSendBundle({
      message: "ok",
      turns,
      threadState: state,
      maxInputChars: 7000
    });
    expect(bundle.level === "compact_state" || bundle.level === "aggressive").toBe(true);
    expect(bundle.threadState.openLoops.length).toBeLessThanOrEqual(4);
    expect(bundle.threadState.recurringTopics.length).toBeLessThanOrEqual(4);
    expect(bundle.smartCompactedContext.activeOpenLoops.length).toBeGreaterThan(0);
    expect(bundle.threadState.smartCompactedContext.activeOpenLoops).toEqual(
      bundle.smartCompactedContext.activeOpenLoops
    );
    expect(bundle.notice?.beforeChars).toBeGreaterThan(bundle.notice?.afterChars ?? 0);
  });
});
