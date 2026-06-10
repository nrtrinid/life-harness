import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { buildAiContextPacket } from "./contextPacketBuilder";
import { ContextPacketBuildError } from "./contextPacket";
import { formatPacketSliceSummary, packetToHarnessContext } from "./contextPacketShim";
import type { HarnessExportInput } from "./harnessContext";
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

describe("buildAiContextPacket", () => {
  it("builds a deterministic seed board packet", () => {
    const first = buildPacket();
    const second = buildPacket();

    expect(first.packetVersion).toBe("0.1");
    expect(first.generatedAt).toBe(FIXED_NOW.toISOString());
    expect(second.activeCards.length).toBe(first.activeCards.length);
    expect(second.staleCards.length).toBe(first.staleCards.length);
    expect(first.activeCards.map((slice) => slice.payload.title)).toEqual(
      second.activeCards.map((slice) => slice.payload.title)
    );
  });

  it("ranks cold career above hot build for pounce intent", () => {
    const hotBuild: LifeCard = {
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
    const coldCareer: LifeCard = {
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

    const packet = buildAiContextPacket({
      data: baseInput({ cards: [hotBuild, coldCareer], proofItems: [], logs: [] }),
      userIntent: {
        message: "What is today's one pounce?",
        mode: "operator",
        sensitivity: "S1"
      },
      now: FIXED_NOW
    });

    const ranked = [...packet.activeCards, ...packet.staleCards].sort(
      (left, right) => right.rank - left.rank
    );
    expect(ranked[0]?.payload.title).toBe("Career Follow-ups");
    expect(ranked[0]?.rank).toBeGreaterThan(ranked.find((item) => item.payload.title === "Hot Build Project")?.rank ?? 0);
  });

  it("excludes S3 cards and rejects S3 requests", () => {
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

    const packet = buildPacket({ cards: [...baseInput().cards, s3Card] });
    const titles = [...packet.activeCards, ...packet.staleCards].map((slice) => slice.payload.title);
    expect(titles).not.toContain("Private Vice Log");
    expect(packet.redaction.excludedCardIds).toContain("s3-card");

    expect(() =>
      buildAiContextPacket({
        data: baseInput(),
        userIntent: { message: "hi", mode: "general", sensitivity: "S3" },
        now: FIXED_NOW
      })
    ).toThrow(ContextPacketBuildError);
  });

  it("redacts S2 vice log rawText from summaries", () => {
    const viceLog: LifeLogEntry = {
      id: "vice-log",
      timestamp: FIXED_NOW.toISOString(),
      rawText: "spent $200 at casino again",
      area: "stability_vices",
      type: "leak",
      xp: 0,
      sensitivity: "S2"
    };

    const packet = buildPacket({ logs: [viceLog] });
    const serialized = JSON.stringify(packet.board.harness.logs);
    expect(serialized).not.toContain("casino");
    expect(serialized).not.toContain("$200");
  });

  it("keeps proof visible without outranking pounce career card", () => {
    const packet = buildAiContextPacket({
      data: baseInput({
        proofItems: [
          {
            id: "proof-1",
            timestamp: FIXED_NOW.toISOString(),
            title: "Shipped gateway smoke layer"
          }
        ]
      }),
      userIntent: {
        message: "What is today's one pounce?",
        mode: "operator",
        sensitivity: "S1"
      },
      now: FIXED_NOW
    });

    expect(packet.recentProof.length).toBeGreaterThan(0);
    const topCard = [...packet.activeCards, ...packet.staleCards].sort(
      (left, right) => right.rank - left.rank
    )[0];
    const topProofRank = packet.recentProof[0]?.rank ?? 0;
    expect(topCard?.payload.area).toBe("Social / Career");
    expect(topCard?.rank).toBeGreaterThan(topProofRank);
  });

  it("produces HarnessContext-compatible shim output", () => {
    const packet = buildPacket();
    const context = packetToHarnessContext(packet);

    expect(Array.isArray(context.cards)).toBe(true);
    expect(Array.isArray(context.logs)).toBe(true);
    expect(Array.isArray(context.proof_items)).toBe(true);
    expect(Array.isArray(context.recent_analyses)).toBe(true);
    expect(Array.isArray(context.decisions)).toBe(true);
    expect(context.cards.length).toBeGreaterThan(0);
  });

  it("handles empty minimal state", () => {
    const packet = buildAiContextPacket({
      data: {
        cards: [],
        logs: [],
        proofItems: [],
        dailyState: createSeedState(FIXED_NOW.toISOString()).dailyState
      },
      userIntent: { message: "", mode: "general", sensitivity: "S1" },
      now: FIXED_NOW
    });

    expect(packet.packetVersion).toBe("0.1");
    expect(packet.activeCards).toEqual([]);
    expect(packet.staleCards).toEqual([]);
    expect(packet.board.harness.cards).toEqual([]);
  });

  it("records budget compaction metadata when forced small", () => {
    const packet = buildAiContextPacket(
      {
        data: baseInput(),
        userIntent: { message: "x".repeat(500), mode: "general", sensitivity: "S1" },
        now: FIXED_NOW
      },
      { maxChars: 500 }
    );

    expect(["trim_low", "compact", "aggressive"]).toContain(packet.budget.compactionLevel);
    expect(packet.budget.droppedSources.length).toBeGreaterThan(0);
  });

  it("formats human-readable slice summary", () => {
    const packet = buildPacket();
    const summary = formatPacketSliceSummary(packet);
    expect(summary).toContain("active");
    expect(summary).toContain("headroom");
    expect(summary.toLowerCase()).not.toContain("openvino");
  });
});

describe("raw lab isolation", () => {
  it("does not import context packet modules from raw lab clients", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const rawLabClient = readFileSync(join(root, "core/rawLabClient.ts"), "utf8");
    const rawLabBudget = readFileSync(join(root, "core/rawLabContextBudget.ts"), "utf8");
    const combined = `${rawLabClient}\n${rawLabBudget}`;

    expect(combined).not.toMatch(/from\s+["'].*contextPacket/);
  });
});
