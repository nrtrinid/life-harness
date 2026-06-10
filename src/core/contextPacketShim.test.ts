import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { buildAiContextPacket } from "./contextPacketBuilder";
import { packetToHarnessContext, resolveSendBundleFromPacket } from "./contextPacketShim";
import type { HarnessExportInput } from "./harnessContext";
import type { ConversationTurn } from "./harnessContext";
import type { LifeCard, LifeLogEntry } from "./types";

const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");

function baseInput(overrides: Partial<HarnessExportInput> = {}): HarnessExportInput {
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
    chatSummaries: seed.chatSummaries,
    ...overrides
  };
}

function buildPacket(
  overrides: Partial<HarnessExportInput> = {},
  message = "What am I avoiding right now?",
  mode: "operator" | "general" = "operator"
) {
  return buildAiContextPacket({
    data: baseInput(overrides),
    userIntent: { message, mode, sensitivity: "S1" },
    now: FIXED_NOW
  });
}

const POUNCE_HOT_BUILD: LifeCard = {
  id: "hot-build",
  title: "Hot Build Project",
  area: "build",
  state: "active",
  progress: 80,
  warmth: "hot",
  whyItMatters: "Shipping momentum.",
  nextTinyAction: "Ship one screen.",
  recentWins: [],
  openLoops: [],
  optimizationIdeas: [],
  proofItemIds: []
};

const POUNCE_COLD_CAREER: LifeCard = {
  id: "cold-career",
  title: "Career Follow-ups",
  area: "social_career",
  state: "parked",
  progress: 5,
  warmth: "cold",
  whyItMatters: "Outside-world thread stalled.",
  nextTinyAction: "Open resume doc and add one bullet.",
  recentWins: [],
  openLoops: [],
  optimizationIdeas: [],
  proofItemIds: []
};

describe("packetToHarnessContext", () => {
  it("produces gateway-compatible HarnessContext shape", () => {
    const packet = buildPacket();
    const context = packetToHarnessContext(packet);

    expect(Array.isArray(context.cards)).toBe(true);
    expect(Array.isArray(context.logs)).toBe(true);
    expect(Array.isArray(context.proof_items)).toBe(true);
    expect(Array.isArray(context.recent_analyses)).toBe(true);
    expect(Array.isArray(context.decisions)).toBe(true);

    const firstCard = context.cards[0];
    expect(firstCard).toBeDefined();
    expect(firstCard).toHaveProperty("next_tiny_action");
    expect(firstCard).toHaveProperty("why_it_matters");
    expect(firstCard).toHaveProperty("title");
  });

  it("orders pounce intent with cold career before hot build in sent cards", () => {
    const packet = buildAiContextPacket({
      data: baseInput({ cards: [POUNCE_HOT_BUILD, POUNCE_COLD_CAREER], proofItems: [], logs: [] }),
      userIntent: {
        message: "What is today's one pounce?",
        mode: "operator",
        sensitivity: "S1"
      },
      now: FIXED_NOW
    });

    const context = packetToHarnessContext(packet);
    expect(context.cards[0]?.title).toBe("Career Follow-ups");
    expect(context.cards.some((card) => card.title === "Hot Build Project")).toBe(true);
  });

  it("excludes S3 cards and sensitive log text from sent context", () => {
    const s3Card: LifeCard = {
      id: "s3-card",
      title: "Private Vice Log",
      area: "stability_vices",
      state: "parked",
      progress: 0,
      warmth: "dormant",
      whyItMatters: "Never export.",
      nextTinyAction: "Manual only.",
      recentWins: [],
      openLoops: [],
      optimizationIdeas: [],
      proofItemIds: [],
      sensitivity: "S3"
    };
    const s3Log: LifeLogEntry = {
      id: "s3-log",
      timestamp: FIXED_NOW.toISOString(),
      rawText: "secret therapy note never send",
      area: "stability_vices",
      type: "clarity",
      xp: 0,
      sensitivity: "S3"
    };

    const packet = buildPacket({ cards: [...baseInput().cards, s3Card], logs: [s3Log] });
    const context = packetToHarnessContext(packet);

    expect(context.cards.map((card) => card.title)).not.toContain("Private Vice Log");
    const logBlob = JSON.stringify(context.logs);
    expect(logBlob).not.toContain("secret therapy note");
  });
});

describe("resolveSendBundleFromPacket", () => {
  it("returns gateway-compatible send bundle shape", () => {
    const packet = buildPacket();
    const history: ConversationTurn[] = [
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" }
    ];

    const bundle = resolveSendBundleFromPacket(packet, {
      message: "What should I do next?",
      conversationHistory: history
    });

    expect(bundle).toHaveProperty("context");
    expect(bundle).toHaveProperty("conversationHistory");
    expect(Array.isArray(bundle.context.cards)).toBe(true);
    expect(bundle.conversationHistory).toEqual(history);

    const wireBody = {
      message: "What should I do next?",
      mode: "operator",
      sensitivity: "S1",
      context: bundle.context,
      conversation_history: bundle.conversationHistory
    };
    expect(wireBody.context).toBe(bundle.context);
    expect(wireBody.conversation_history).toBe(bundle.conversationHistory);
  });

  it("trims conversation history when prompt would exceed budget", () => {
    const packet = buildPacket();
    const longTurn: ConversationTurn = {
      role: "user",
      content: "x".repeat(20_000)
    };
    const history: ConversationTurn[] = [
      longTurn,
      { role: "assistant", content: "y".repeat(20_000) },
      { role: "user", content: "z".repeat(20_000) }
    ];

    const bundle = resolveSendBundleFromPacket(packet, {
      message: "Short follow-up",
      conversationHistory: history,
      threadStateJsonChars: 500
    });

    expect(bundle.conversationHistory.length).toBeLessThan(history.length);
  });

  it("handles minimal empty state", () => {
    const packet = buildAiContextPacket({
      data: {
        cards: [],
        logs: [],
        proofItems: [],
        dailyState: createSeedState(FIXED_NOW.toISOString()).dailyState
      },
      userIntent: { message: "hello", mode: "general", sensitivity: "S1" },
      now: FIXED_NOW
    });

    const history: ConversationTurn[] = [{ role: "user", content: "hello" }];
    const bundle = resolveSendBundleFromPacket(packet, {
      message: "hello",
      conversationHistory: history
    });

    expect(bundle.context.cards).toEqual([]);
    expect(Array.isArray(bundle.context.logs)).toBe(true);
    expect(bundle.conversationHistory).toEqual(history);
  });
});
