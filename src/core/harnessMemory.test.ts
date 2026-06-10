import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  applyDeleteChatSummary,
  applySaveChatSummary,
  buildChatSummary
} from "./harnessMemory";

const FIXED_CREATED_AT = "2026-06-09T12:00:00.000Z";

describe("buildChatSummary", () => {
  it("creates a deterministic summary with fixed createdAt", () => {
    const summary = buildChatSummary({
      userMessage: "What am I avoiding right now?",
      assistantAnswer:
        "Career / Networking is cold while Build is hot. Next step: send one follow-up on Qualcomm.",
      mode: "operator",
      confidenceNotes: ["Inferred — career avoidance signal."],
      safetyNotes: [],
      createdAt: FIXED_CREATED_AT
    });

    expect(summary.createdAt).toBe(FIXED_CREATED_AT);
    expect(summary.mode).toBe("operator");
    expect(summary.userMessage).toBe("What am I avoiding right now?");
    expect(summary.patterns).toContain("career avoidance");
    expect(summary.patterns).toContain("build-heavy momentum");
    expect(summary.decisions).toEqual(["Next step: send one follow-up on Qualcomm."]);
    expect(summary.rememberForNextTime.length).toBeGreaterThanOrEqual(1);
    expect(summary.id).toMatch(/^chat-memory-/);
  });

  it("extracts at least one rememberForNextTime item", () => {
    const summary = buildChatSummary({
      userMessage: "What should I do next?",
      assistantAnswer: "Try one tiny career move today.",
      mode: "operator",
      confidenceNotes: [],
      safetyNotes: [],
      createdAt: FIXED_CREATED_AT
    });

    expect(summary.rememberForNextTime.length).toBeGreaterThanOrEqual(1);
  });

  it("does not treat generic should lines as decisions", () => {
    const summary = buildChatSummary({
      userMessage: "Help",
      assistantAnswer: "You should probably think about your board. Maybe park something.",
      mode: "general",
      confidenceNotes: [],
      safetyNotes: [],
      createdAt: FIXED_CREATED_AT
    });

    expect(summary.decisions).toEqual([]);
  });

  it("caps decisions at two", () => {
    const summary = buildChatSummary({
      userMessage: "Plan",
      assistantAnswer: [
        "Decided to focus on career today.",
        "Recommendation: send one follow-up.",
        "Next step: review the candidate queue."
      ].join("\n"),
      mode: "operator",
      confidenceNotes: [],
      safetyNotes: [],
      createdAt: FIXED_CREATED_AT
    });

    expect(summary.decisions.length).toBeLessThanOrEqual(2);
  });
});

describe("chat summary state mutators", () => {
  it("applySaveChatSummary prepends and caps the list", () => {
    const state = createSeedState(FIXED_CREATED_AT);
    const first = buildChatSummary({
      userMessage: "One",
      assistantAnswer: "First answer.",
      mode: "general",
      confidenceNotes: [],
      safetyNotes: [],
      createdAt: FIXED_CREATED_AT
    });
    const second = buildChatSummary({
      userMessage: "Two",
      assistantAnswer: "Second answer.",
      mode: "general",
      confidenceNotes: [],
      safetyNotes: [],
      createdAt: FIXED_CREATED_AT
    });

    const saved = applySaveChatSummary(applySaveChatSummary(state, first), second);
    expect(saved.chatSummaries[0]?.userMessage).toBe("Two");
    expect(saved.chatSummaries[1]?.userMessage).toBe("One");
  });

  it("applyDeleteChatSummary removes a summary by id", () => {
    const state = createSeedState(FIXED_CREATED_AT);
    const summary = buildChatSummary({
      userMessage: "Delete me",
      assistantAnswer: "Answer.",
      mode: "general",
      confidenceNotes: [],
      safetyNotes: [],
      createdAt: FIXED_CREATED_AT
    });
    const saved = applySaveChatSummary(state, summary);

    expect(applyDeleteChatSummary(saved, summary.id).chatSummaries).toEqual([]);
  });
});
