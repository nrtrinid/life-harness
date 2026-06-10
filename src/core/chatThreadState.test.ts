import { describe, expect, it } from "vitest";

import {
  CHAT_HARNESS_MAX_HISTORY_CHARS,
  CHAT_HARNESS_MAX_HISTORY_TURNS,
  classifyTurnIntent,
  compactText,
  createEmptySharedChatThreadState,
  detectOpenLoops,
  detectUserSteering,
  extractLastOptions,
  applyVariantPromptToThreadState,
  buildGroundedHandoffDigest,
  inferActiveGoalAndTopic,
  shouldSuggestGroundedHandoff,
  packConversationHistoryForGateway,
  resolveLikelyReference,
  toWireChatHarnessThreadState,
  trimConversationTurns,
  updateSharedChatThreadStateAfterTurn,
  type ChatTurn
} from "./chatThreadState";

describe("compactText", () => {
  it("returns trimmed text when under limit", () => {
    expect(compactText("  hello   world  ", 20)).toBe("hello world");
  });

  it("truncates with ellipsis when over limit", () => {
    expect(compactText("abcdefghij", 6)).toBe("abc...");
  });
});

describe("trimConversationTurns", () => {
  const turns = (count: number): ChatTurn[] =>
    Array.from({ length: count }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn-${index}`
    }));

  it("preserves chronological order", () => {
    const input = turns(4);
    const result = trimConversationTurns(input);
    expect(result.map((t) => t.content)).toEqual(["turn-0", "turn-1", "turn-2", "turn-3"]);
  });

  it("trims by max turn count", () => {
    const input = turns(CHAT_HARNESS_MAX_HISTORY_TURNS + 3);
    const result = trimConversationTurns(input);
    expect(result).toHaveLength(CHAT_HARNESS_MAX_HISTORY_TURNS);
    expect(result[0]?.content).toBe("turn-3");
  });

  it("trims by char budget", () => {
    const input: ChatTurn[] = Array.from({ length: 6 }, (_, index) => ({
      role: "user",
      content: "x".repeat(500) + index
    }));
    const result = trimConversationTurns(input, { maxChars: 800 });
    expect(estimateChars(result)).toBeLessThanOrEqual(800);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(input.length);
  });

  it("excludes empty turns", () => {
    const input: ChatTurn[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "   " },
      { role: "user", content: "again" }
    ];
    const result = trimConversationTurns(input);
    expect(result).toHaveLength(2);
    expect(result[1]?.content).toBe("again");
  });
});

function estimateChars(turns: ChatTurn[]): number {
  return JSON.stringify(turns).length;
}

describe("shared thread state", () => {
  it("creates empty state with defaults", () => {
    const state = createEmptySharedChatThreadState("2026-01-01T00:00:00.000Z");
    expect(state.taskMode).toBe("casual");
    expect(state.openLoops).toEqual([]);
    expect(state.references.lastOptions).toEqual([]);
  });

  it("detects open loops", () => {
    expect(detectOpenLoops("How would we build that?")).toHaveLength(1);
    expect(detectOpenLoops("Thanks")).toHaveLength(0);
  });

  it("detects user steering", () => {
    expect(detectUserSteering("Make it shorter and be blunt")).toEqual(
      expect.arrayContaining(["make it shorter", "be blunt"])
    );
  });

  it("classifies turn intent", () => {
    expect(classifyTurnIntent("Teach me how to write a for loop")).toBe("write_code");
    expect(classifyTurnIntent("Make it shorter")).toBe("style_steering");
  });

  it("infers active goal conservatively", () => {
    const previous = createEmptySharedChatThreadState();
    const result = inferActiveGoalAndTopic({
      previous,
      userMessage: "Design a thread intelligence layer for chat",
      turns: []
    });
    expect(result.activeGoal).toContain("thread intelligence");
    expect(result.currentTopic).toContain("thread intelligence");
  });

  it("updates state after turn", () => {
    const previous = createEmptySharedChatThreadState();
    const turns: ChatTurn[] = [
      { role: "user", content: "Can we get an implementation prompt?" },
      {
        role: "assistant",
        content: "x".repeat(150)
      },
      { role: "user", content: "Make it shorter" }
    ];
    const next = updateSharedChatThreadStateAfterTurn({
      previous,
      userMessage: "Make it shorter",
      assistantAnswer: "y".repeat(150),
      turns
    });
    expect(next.userSteering).toContain("make it shorter");
    expect(next.taskMode).toBe("style_steering");
    expect(next.doNotRepeat.length).toBeGreaterThan(0);
  });

  it("maps wire snake_case fields", () => {
    const state = createEmptySharedChatThreadState();
    state.activeGoal = "Ship thread state";
    state.currentTopic = "gateway schema";
    const wire = toWireChatHarnessThreadState(state);
    expect(wire.active_goal).toBe("Ship thread state");
    expect(wire.current_topic).toBe("gateway schema");
    expect(wire.user_steering).toEqual([]);
  });

  it("extracts options from assistant answer", () => {
    const options = extractLastOptions(
      "Option A: thread state\nOption B: multi-pass reasoning\nOption C: streaming"
    );
    expect(options[1]).toContain("multi-pass");
  });

  it("resolves second option reference", () => {
    const state = createEmptySharedChatThreadState();
    state.references.lastOptions = ["thread state", "multi-pass reasoning", "streaming"];
    const ref = resolveLikelyReference({ userMessage: "do the second one", state });
    expect(ref).toContain("multi-pass");
  });

  it("packs relevant older turns within char budget", () => {
    const state = createEmptySharedChatThreadState();
    state.references.lastOptions = ["inventory module"];
    state.currentTopic = "inventory";
    const turns = [
      { role: "user" as const, content: "old unrelated weather chat" },
      { role: "assistant" as const, content: "Weather looks fine." },
      { role: "user" as const, content: "Let's design inventory module" },
      { role: "assistant" as const, content: "Inventory module needs SKU tracking." },
      { role: "user" as const, content: "continue inventory" },
      { role: "assistant" as const, content: "Next step: add stock counts." }
    ];
    const packed = packConversationHistoryForGateway({
      turns,
      state,
      latestMessage: "add inventory tracking",
      maxChars: 500,
      alwaysIncludeRecentTurns: 2
    });
    const combined = packed.map((turn) => turn.content).join("\n");
    expect(combined.toLowerCase()).toContain("inventory");
  });

  it("builds grounded handoff digest without personality fields", () => {
    const state = createEmptySharedChatThreadState();
    state.activeGoal = "Explore thread intelligence";
    state.recentDigest = "Discussed multi-turn chat.";
    const digest = buildGroundedHandoffDigest({
      state,
      recentUserMessages: ["How do references work?"]
    });
    expect(digest).toContain("Raw Signal");
    expect(digest).toContain("board context");
    expect(digest.toLowerCase()).not.toContain("personality");
    expect(digest.toLowerCase()).not.toContain("voice trait");
  });

  it("suggests grounded handoff for board-like messages", () => {
    expect(shouldSuggestGroundedHandoff("How many active cards do I have?")).toBe(true);
    expect(shouldSuggestGroundedHandoff("Give me a weird riff")).toBe(false);
  });

  it("applies variant steering before send", () => {
    const state = createEmptySharedChatThreadState();
    const next = applyVariantPromptToThreadState(
      state,
      "Turn that into a concrete step-by-step plan."
    );
    expect(next.taskMode).toBe("plan");
    expect(next.userSteering.length).toBeGreaterThanOrEqual(0);
  });
});
