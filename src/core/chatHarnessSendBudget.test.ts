import { describe, expect, it } from "vitest";

import type { ChatThreadItem } from "../components/askHarness/types";
import { createSeedState } from "../data/createSeedState";
import {
  buildChatHarnessSendBundle,
  estimateChatHarnessSendPromptChars
} from "./chatHarnessSendBudget";
import { buildConversationHistoryFromThread } from "./askHarnessThreadAdapter";
import {
  applyLikelyReferenceForSend,
  CHAT_HARNESS_MAX_HISTORY_CHARS,
  compactSharedChatThreadStateForSendBudget,
  createEmptySharedChatThreadState,
  packConversationHistoryForGateway,
  updateSharedChatThreadStateAfterTurn,
  type SharedChatThreadState
} from "./chatThreadState";
import { buildCompactHarnessContext, type HarnessExportInput } from "./harnessContext";
import type { ChatHarnessResponse } from "./harnessContext";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";

function baseInput(overrides: Partial<HarnessExportInput> = {}): HarnessExportInput {
  const seed = createSeedState(FIXED_NOW);
  return {
    cards: seed.cards,
    logs: seed.logs,
    proofItems: seed.proofItems,
    dailyState: seed.dailyState,
    resumeModules: seed.resumeModules,
    jobCandidates: seed.jobCandidates,
    jobSourceRuns: seed.jobSourceRuns,
    memoryItems: seed.memoryItems,
    chatSummaries: seed.chatSummaries,
    ...overrides
  };
}

function assistantResponse(answer: string): ChatHarnessResponse {
  return {
    answer,
    used_context: true,
    confidence_notes: [],
    safety_notes: []
  };
}

function turn1Thread(longAnswer: string): ChatThreadItem[] {
  return [
    {
      id: "u1",
      kind: "user",
      text: "What should I focus on this week?",
      mode: "operator"
    },
    {
      id: "a1",
      kind: "assistant",
      userText: "What should I focus on this week?",
      mode: "operator",
      response: assistantResponse(longAnswer),
      memorySaved: false,
      savedCandidateKeys: [],
      showMemoryPreview: false,
      showConfidence: false,
      showMemoryTools: false
    }
  ];
}

function threadStateAfterTurn1(longAnswer: string): SharedChatThreadState {
  return updateSharedChatThreadStateAfterTurn({
    previous: createEmptySharedChatThreadState(FIXED_NOW),
    userMessage: "What should I focus on this week?",
    assistantAnswer: longAnswer,
    turns: [
      { role: "user", content: "What should I focus on this week?" },
      { role: "assistant", content: longAnswer }
    ]
  });
}

describe("buildChatHarnessSendBundle", () => {
  it("turn1_fits with empty history and compact context under cap", () => {
    const bundle = buildChatHarnessSendBundle({
      exportInput: baseInput(),
      message: "What next?",
      priorThread: [],
      threadState: createEmptySharedChatThreadState(FIXED_NOW),
      preferredContextMode: "compact",
      maxPromptChars: 18_000
    });

    expect(bundle.fits).toBe(true);
    expect(bundle.conversationHistory).toHaveLength(0);
    expect(bundle.contextMode).toBe("compact");
    expect(bundle.estimatedChars).toBeLessThanOrEqual(18_000);
  });

  it("turn2_fits_after_trim with long assistant reply at 18k and would fail at 12k", () => {
    const longAnswer = "Focus on one active card. ".repeat(200);
    const priorThread = turn1Thread(longAnswer);
    const threadState = threadStateAfterTurn1(longAnswer);
    const turn2Message = "Can you make that smaller and more actionable?";
    const exportInput = baseInput();
    const threadStateForSend = applyLikelyReferenceForSend(threadState, turn2Message);
    const packedHistory = packConversationHistoryForGateway({
      turns: buildConversationHistoryFromThread(priorThread),
      state: threadStateForSend,
      latestMessage: turn2Message,
      maxChars: CHAT_HARNESS_MAX_HISTORY_CHARS
    });
    const uncompactedEstimate = estimateChatHarnessSendPromptChars({
      context: buildCompactHarnessContext(exportInput),
      message: turn2Message,
      conversationHistory: packedHistory,
      threadState: threadStateForSend
    });
    expect(uncompactedEstimate).toBeGreaterThan(12_000);

    const bundle18k = buildChatHarnessSendBundle({
      exportInput,
      message: turn2Message,
      priorThread,
      threadState,
      preferredContextMode: "compact",
      maxPromptChars: 18_000
    });

    expect(bundle18k.fits).toBe(true);
    expect(bundle18k.estimatedChars).toBeLessThanOrEqual(18_000);
  });

  it("history_trimmed_before_block reduces long history and still fits", () => {
    const turns: ChatThreadItem[] = [];
    for (let index = 0; index < 6; index += 1) {
      turns.push({
        id: `u${index}`,
        kind: "user",
        text: `Question ${index}: ${"detail ".repeat(40)}`,
        mode: "general"
      });
      turns.push({
        id: `a${index}`,
        kind: "assistant",
        userText: `Question ${index}`,
        mode: "general",
        response: assistantResponse(`Answer ${index}: ${"context ".repeat(60)}`),
        memorySaved: false,
        savedCandidateKeys: [],
        showMemoryPreview: false,
        showConfidence: false,
        showMemoryTools: false
      });
    }

    const bundle = buildChatHarnessSendBundle({
      exportInput: baseInput(),
      message: "Summarize our thread.",
      priorThread: turns,
      threadState: createEmptySharedChatThreadState(FIXED_NOW),
      preferredContextMode: "compact",
      maxPromptChars: 14_000
    });

    expect(bundle.fits).toBe(true);
    expect(bundle.conversationHistory.length).toBeLessThan(12);
    expect(bundle.notice?.level).toBe("trim_history");
  });

  it("thread_state_compaction_reduces_estimate", () => {
    const bloated: SharedChatThreadState = {
      ...createEmptySharedChatThreadState(FIXED_NOW),
      recentDigest: "digest ".repeat(200),
      activeGoal: "goal ".repeat(80),
      currentTopic: "topic ".repeat(80),
      openLoops: Array.from({ length: 8 }, (_, index) => `loop ${index} `.repeat(20)),
      pinnedFacts: Array.from({ length: 8 }, (_, index) => `fact ${index} `.repeat(20)),
      references: {
        lastOptions: ["A", "B", "C", "D", "E", "F"],
        lastCodeBlock: { language: "ts", code: "x".repeat(4000) },
        lastPlan: "plan ".repeat(200)
      }
    };
    const context = buildCompactHarnessContext(baseInput());
    const message = "Continue.";
    const history: { role: "user" | "assistant"; content: string }[] = [];

    const before = estimateChatHarnessSendPromptChars({
      context,
      message,
      conversationHistory: history,
      threadState: bloated
    });
    const compacted = compactSharedChatThreadStateForSendBudget(bloated, "compact");
    const after = estimateChatHarnessSendPromptChars({
      context,
      message,
      conversationHistory: history,
      threadState: compacted
    });

    expect(after).toBeLessThan(before);
  });

  it("board_compacts_after_history when context mode becomes compact", () => {
    const longAnswer = "Ship the smallest slice. ".repeat(120);
    const bundle = buildChatHarnessSendBundle({
      exportInput: baseInput(),
      message: "What is the one move?",
      priorThread: turn1Thread(longAnswer),
      threadState: threadStateAfterTurn1(longAnswer),
      preferredContextMode: "full",
      maxPromptChars: 13_500
    });

    expect(bundle.fits).toBe(true);
    expect(bundle.contextMode).toBe("compact");
    expect(bundle.notice?.level).toBe("compact_context");
    expect(bundle.context.cards.every((card) => !card.title.startsWith("Resume:"))).toBe(true);
  });

  it("no_duplicate_current_message excludes in-flight user message", () => {
    const priorThread = turn1Thread("First answer with enough detail to keep history relevant.");
    const bundle = buildChatHarnessSendBundle({
      exportInput: baseInput(),
      message: "Brand-new message not yet in thread.",
      priorThread,
      threadState: threadStateAfterTurn1("First answer with enough detail to keep history relevant."),
      preferredContextMode: "compact",
      maxPromptChars: 18_000
    });

    const contents = bundle.conversationHistory.map((turn) => turn.content);
    expect(contents).not.toContain("Brand-new message not yet in thread.");
  });

  it("assistant_uses_answer_only in history", () => {
    const priorThread = turn1Thread("Short answer.");
    const history = buildConversationHistoryFromThread(priorThread);
    expect(history).toEqual([
      { role: "user", content: "What should I focus on this week?" },
      { role: "assistant", content: "Short answer." }
    ]);
    expect(history.some((turn) => turn.content.includes("memory_candidates"))).toBe(false);
  });

  it("error_turns_skipped in history", () => {
    const priorThread: ChatThreadItem[] = [
      { id: "u1", kind: "user", text: "Hello", mode: "general" },
      {
        id: "e1",
        kind: "error",
        text: "Gateway failed",
        contextMode: "compact",
        baseUrl: "http://127.0.0.1:8111"
      }
    ];
    const bundle = buildChatHarnessSendBundle({
      exportInput: baseInput(),
      message: "Try again",
      priorThread,
      threadState: createEmptySharedChatThreadState(FIXED_NOW),
      preferredContextMode: "compact",
      maxPromptChars: 18_000
    });

    expect(bundle.conversationHistory).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("minimal_still_blocks when prompt is impossible", () => {
    const hugeMessage = "x".repeat(20_000);
    const bundle = buildChatHarnessSendBundle({
      exportInput: baseInput(),
      message: hugeMessage,
      priorThread: [],
      threadState: createEmptySharedChatThreadState(FIXED_NOW),
      preferredContextMode: "compact",
      maxPromptChars: 18_000
    });

    expect(bundle.fits).toBe(false);
    expect(bundle.estimatedChars).toBeGreaterThan(18_000);
  });
});
