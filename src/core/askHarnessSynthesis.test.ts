import { describe, expect, it } from "vitest";

import type { ChatThreadItem } from "./chatHarnessTypes";
import { createSeedState } from "../data/createSeedState";
import {
  buildAskDeepSynthesisRequest,
  buildAskSynthesisUserPrompt,
  buildAskThreadFingerprint,
  buildSynthesisReportPlainText,
  fingerprintToKey,
  isAskThreadEligibleForSynthesis,
  isSynthesisResultStale,
} from "./askHarnessSynthesis";
import { parseDeepSynthesisCompletedResult } from "./deepSynthesisTypes";
import { sampleCompletedWireBody } from "./deepSynthesisTypes.test";
import { createEmptySharedChatThreadState, type SharedChatThreadState } from "./chatThreadState";
import type { HarnessExportInput } from "./harnessContext";
import { toWireDeepSynthesisRequest } from "./deepSynthesisClient";

const FIXED_NOW = new Date("2026-06-10T12:00:00.000Z");

function baseExportInput(): HarnessExportInput {
  const seed = createSeedState(FIXED_NOW.toISOString());
  return {
    cards: seed.cards,
    logs: seed.logs,
    proofItems: seed.proofItems,
    dailyState: seed.dailyState,
    resumeModules: seed.resumeModules,
    jobCandidates: seed.jobCandidates,
    jobSourceRuns: seed.jobSourceRuns,
    memoryItems: seed.memoryItems,
    chatSummaries: seed.chatSummaries
  };
}

function assistantItem(
  id: string,
  userText: string,
  answer: string,
  mode: "general" | "operator" = "general"
): Extract<ChatThreadItem, { kind: "assistant" }> {
  return {
    id,
    kind: "assistant",
    userText,
    mode,
    response: {
      answer,
      used_context: true,
      confidence_notes: [],
      safety_notes: []
    },
    memorySaved: false,
    savedCandidateKeys: [],
    showMemoryPreview: false,
    showConfidence: false,
    showMemoryTools: false
  };
}

function userItem(
  id: string,
  text: string,
  mode: "general" | "operator" = "general"
): Extract<ChatThreadItem, { kind: "user" }> {
  return {
    id,
    kind: "user",
    text,
    mode
  };
}

function eligibleThread(): ChatThreadItem[] {
  return [
    userItem("u1", "What am I avoiding right now?", "operator"),
    assistantItem("a1", "What am I avoiding right now?", "Probably the outside-world follow-up."),
    userItem("u2", "How do I restart?", "operator"),
    assistantItem("a2", "How do I restart?", "Pick one tiny action and do it today.")
  ];
}

describe("isAskThreadEligibleForSynthesis", () => {
  it("is false on empty thread", () => {
    expect(
      isAskThreadEligibleForSynthesis([], createEmptySharedChatThreadState(), "S1")
    ).toBe(false);
  });

  it("is false on S3", () => {
    expect(
      isAskThreadEligibleForSynthesis(eligibleThread(), createEmptySharedChatThreadState(), "S3")
    ).toBe(false);
  });

  it("is true with enough user turns", () => {
    expect(
      isAskThreadEligibleForSynthesis(eligibleThread(), createEmptySharedChatThreadState(), "S1")
    ).toBe(true);
  });

  it("is true with digest even for a single user turn", () => {
    const thread = [
      userItem("u1", "Short question"),
      assistantItem("a1", "Short question", "Short answer.")
    ];
    const threadState: SharedChatThreadState = {
      ...createEmptySharedChatThreadState(),
      recentDigest: "A".repeat(40)
    };
    expect(isAskThreadEligibleForSynthesis(thread, threadState, "S1")).toBe(true);
  });
});

describe("buildAskSynthesisUserPrompt", () => {
  it("includes base prompt, last user message, and digest", () => {
    const thread = eligibleThread();
    const threadState: SharedChatThreadState = {
      ...createEmptySharedChatThreadState(),
      recentDigest: "We keep circling build vs career."
    };
    const prompt = buildAskSynthesisUserPrompt(thread, threadState);
    expect(prompt).toContain("structured report");
    expect(prompt).toContain("How do I restart?");
    expect(prompt).toContain("Recent thread digest:");
  });
});

describe("buildAskDeepSynthesisRequest", () => {
  it("builds Ask-scoped deep synthesis request with critic default and lenses", () => {
    const request = buildAskDeepSynthesisRequest({
      thread: eligibleThread(),
      threadState: createEmptySharedChatThreadState(),
      exportInput: baseExportInput(),
      contextMode: "full",
      sensitivity: "S1"
    });

    expect(request.trigger).toBe("thread_excerpt");
    expect(request.pipelineProfile).toBe("with_critic");
    expect(request.interpretationLenses).toEqual(["practical", "emotional", "product"]);
    expect(request.contextPacket).toBeDefined();
    expect(request.conversationHistory?.length).toBeGreaterThan(0);
    expect(request.threadState).toBeDefined();
    expect(request.userPrompt).toContain("structured report");

    const wire = toWireDeepSynthesisRequest(request);
    expect(wire.context_packet).toBeDefined();
    expect(wire.conversation_history).toBeDefined();
    expect(wire.thread_state).toBeDefined();
    expect(JSON.stringify(wire)).not.toContain("personality");
  });

  it("forwards reasoningDepth into send bundle when provided", () => {
    const baseArgs = {
      thread: eligibleThread(),
      threadState: createEmptySharedChatThreadState(),
      exportInput: baseExportInput(),
      contextMode: "full" as const,
      sensitivity: "S1" as const,
    };
    const fast = buildAskDeepSynthesisRequest({ ...baseArgs, reasoningDepth: "fast" });
    const deep = buildAskDeepSynthesisRequest({ ...baseArgs, reasoningDepth: "deep" });

    expect(fast.conversationHistory?.length).toBeGreaterThan(0);
    expect(deep.conversationHistory?.length).toBeGreaterThan(0);
    expect(deep.userPrompt).toContain("structured report");
  });
});

describe("buildSynthesisReportPlainText", () => {
  it("includes primary report sections for clipboard copy", () => {
    const result = parseDeepSynthesisCompletedResult(sampleCompletedWireBody());
    const text = buildSynthesisReportPlainText(result);
    expect(text).toContain("What we're circling");
    expect(text).toContain(result.circling);
    expect(text).toContain(result.strongestIdea);
    expect(text).toContain(result.hiddenRisk);
    expect(text).toContain(result.nextPounce.smallestAction);
  });
});

describe("ask thread fingerprint", () => {
  it("changes when a new assistant response arrives", () => {
    const threadState = createEmptySharedChatThreadState();
    const before = buildAskThreadFingerprint(
      [
        userItem("u1", "Same question"),
        assistantItem("a1", "Same question", "First answer.")
      ],
      threadState
    );
    const after = buildAskThreadFingerprint(
      [
        userItem("u1", "Same question"),
        assistantItem("a1", "Same question", "First answer."),
        assistantItem("a2", "Same question", "Revised answer with more detail.")
      ],
      threadState
    );

    expect(before.lastUserMessageLength).toBe(after.lastUserMessageLength);
    expect(before.lastAssistantAnswerLength).not.toBe(after.lastAssistantAnswerLength);
    expect(fingerprintToKey(before)).not.toBe(fingerprintToKey(after));
  });

  it("detects stale synthesis via fingerprint mismatch", () => {
    const threadState = createEmptySharedChatThreadState();
    const requestFingerprint = buildAskThreadFingerprint(eligibleThread(), threadState);
    const currentFingerprint = buildAskThreadFingerprint(
      [...eligibleThread(), userItem("u3", "Another message")],
      threadState
    );

    expect(isSynthesisResultStale(currentFingerprint, requestFingerprint)).toBe(true);
    expect(isSynthesisResultStale(requestFingerprint, requestFingerprint)).toBe(false);
  });
});
