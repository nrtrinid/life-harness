import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import type { HarnessChatSummary, HarnessMemoryItem } from "./types";
import {
  applyDeleteMemoryItem,
  applySaveMemoryItem,
  applyToggleMemoryItemActive,
  applyUpdateMemoryItem,
  buildMemoryBankAnalyses,
  buildMemoryBankDecisions,
  buildMemoryCandidatesFromChatSummary,
  countSentences,
  createMemoryItem,
  getActiveMemoryItems,
  groupMemoryItemsByKind,
  isDurableMemoryDecision,
  memoryItemDedupeKey,
  MEMORY_BANK_PREFIX
} from "./harnessMemoryBank";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";

function fixtureChatSummary(overrides: Partial<HarnessChatSummary> = {}): HarnessChatSummary {
  return {
    id: "chat-memory-fixture",
    createdAt: FIXED_NOW,
    mode: "operator",
    userMessage: "What am I avoiding right now?",
    assistantSummary: "Career thread looks cold while Build stays hot.",
    patterns: ["career avoidance", "build-heavy momentum"],
    decisions: ["Career-first Momentum Board is current practical direction."],
    suggestedNextActions: ["Review the candidate queue."],
    rememberForNextTime: ["Pattern signal: career avoidance.", "Keep proof visible."],
    ...overrides
  };
}

function fixtureMemoryItem(overrides: Partial<HarnessMemoryItem> = {}): HarnessMemoryItem {
  return createMemoryItem(
    {
      kind: "pattern",
      title: "Career avoidance pattern",
      summary: "Career threads can stay cold while build work stays hot.",
      tags: ["career"],
      sourceChatSummaryId: "chat-memory-fixture",
      isActive: true,
      ...overrides
    },
    FIXED_NOW
  );
}

describe("isDurableMemoryDecision", () => {
  it("rejects ephemeral next actions", () => {
    expect(isDurableMemoryDecision("You should walk 10 minutes today.")).toBe(false);
    expect(isDurableMemoryDecision("Next step: send one follow-up on Qualcomm.")).toBe(false);
  });

  it("accepts durable direction lines", () => {
    expect(isDurableMemoryDecision("Career-first Momentum Board is current practical direction.")).toBe(
      true
    );
  });
});

describe("buildMemoryCandidatesFromChatSummary", () => {
  it("generates pattern, trap, and rule candidates from fixture summary", () => {
    const summary = fixtureChatSummary({
      patterns: ["career avoidance", "build-heavy momentum", "over-optimization"]
    });
    const candidates = buildMemoryCandidatesFromChatSummary(summary);

    expect(candidates.some((item) => item.kind === "pattern" && item.title.includes("Career avoidance"))).toBe(
      true
    );
    expect(candidates.some((item) => item.kind === "trap")).toBe(true);
    expect(candidates.some((item) => item.kind === "rule" && item.title === "Career-before-tooling")).toBe(
      true
    );
    expect(candidates.some((item) => item.kind === "decision")).toBe(true);
    expect(candidates.some((item) => item.kind === "preference")).toBe(true);
  });

  it("does not promote ephemeral decisions", () => {
    const candidates = buildMemoryCandidatesFromChatSummary(
      fixtureChatSummary({
        decisions: ["You should walk 10 minutes today.", "Next step: send one follow-up."]
      })
    );

    expect(candidates.some((item) => item.kind === "decision")).toBe(false);
  });

  it("skips duplicates already in the ledger", () => {
    const summary = fixtureChatSummary();
    const existing = fixtureMemoryItem();
    const candidates = buildMemoryCandidatesFromChatSummary(summary, [existing]);

    expect(
      candidates.some(
        (item) => memoryItemDedupeKey(item) === memoryItemDedupeKey(existing)
      )
    ).toBe(false);
  });

  it("caps summaries at one or two sentences", () => {
    const candidates = buildMemoryCandidatesFromChatSummary(fixtureChatSummary());

    for (const candidate of candidates) {
      expect(countSentences(candidate.summary)).toBeLessThanOrEqual(2);
    }
  });
});

describe("createMemoryItem", () => {
  it("uses fixed now and optional timestamp overrides", () => {
    const item = createMemoryItem(
      {
        kind: "pattern",
        title: "Test",
        summary: "One sentence.",
        tags: [],
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z"
      },
      FIXED_NOW
    );

    expect(item.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(item.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(item.id).toMatch(/^memory-item-/);
  });

  it("defaults timestamps to now", () => {
    const item = createMemoryItem(
      {
        kind: "rule",
        title: "Rule",
        summary: "Durable rule.",
        tags: [],
        isActive: true
      },
      FIXED_NOW
    );

    expect(item.createdAt).toBe(FIXED_NOW);
    expect(item.updatedAt).toBe(FIXED_NOW);
  });
});

describe("memory item state mutators", () => {
  it("applySaveMemoryItem prepends items", () => {
    const state = createSeedState(FIXED_NOW);
    const first = fixtureMemoryItem({ title: "First" });
    const second = fixtureMemoryItem({ title: "Second", id: "memory-item-second" });

    const saved = applySaveMemoryItem(applySaveMemoryItem(state, first), second);
    expect(saved.memoryItems[0]?.title).toBe("Second");
    expect(saved.memoryItems[1]?.title).toBe("First");
  });

  it("applyDeleteMemoryItem removes by id", () => {
    const item = fixtureMemoryItem();
    const state = applySaveMemoryItem(createSeedState(FIXED_NOW), item);

    expect(applyDeleteMemoryItem(state, item.id).memoryItems).toEqual([]);
  });

  it("applyUpdateMemoryItem replaces by id", () => {
    const item = fixtureMemoryItem();
    const state = applySaveMemoryItem(createSeedState(FIXED_NOW), item);
    const updated = applyUpdateMemoryItem(state, {
      ...item,
      summary: "Updated summary.",
      updatedAt: "2026-06-10T12:00:00.000Z"
    });

    expect(updated.memoryItems[0]?.summary).toBe("Updated summary.");
  });

  it("applyToggleMemoryItemActive flips isActive", () => {
    const item = fixtureMemoryItem({ isActive: true });
    const state = applySaveMemoryItem(createSeedState(FIXED_NOW), item);
    const toggled = applyToggleMemoryItemActive(state, item.id, "2026-06-10T12:00:00.000Z");

    expect(toggled.memoryItems[0]?.isActive).toBe(false);
    expect(toggled.memoryItems[0]?.updatedAt).toBe("2026-06-10T12:00:00.000Z");
  });
});

describe("memory bank helpers", () => {
  it("getActiveMemoryItems filters inactive entries", () => {
    const active = fixtureMemoryItem({ isActive: true });
    const inactive = fixtureMemoryItem({
      id: "memory-item-inactive",
      isActive: false,
      title: "Inactive"
    });

    expect(getActiveMemoryItems([active, inactive])).toEqual([active]);
  });

  it("groupMemoryItemsByKind buckets items", () => {
    const pattern = fixtureMemoryItem({ kind: "pattern" });
    const rule = fixtureMemoryItem({ kind: "rule", id: "memory-item-rule", title: "Rule" });
    const grouped = groupMemoryItemsByKind([pattern, rule]);

    expect(grouped.pattern).toHaveLength(1);
    expect(grouped.rule).toHaveLength(1);
    expect(grouped.trap).toHaveLength(0);
  });

  it("buildMemoryBankAnalyses and buildMemoryBankDecisions prefix export lines", () => {
    const pattern = fixtureMemoryItem({ kind: "pattern", isActive: true });
    const rule = fixtureMemoryItem({
      kind: "rule",
      id: "memory-item-rule",
      title: "Career-before-tooling",
      isActive: true
    });
    const inactive = fixtureMemoryItem({
      id: "memory-item-inactive",
      isActive: false,
      title: "Hidden"
    });

    const analyses = buildMemoryBankAnalyses([pattern, rule, inactive], 10);
    const decisions = buildMemoryBankDecisions([pattern, rule, inactive], 10);

    expect(analyses[0]?.summary.startsWith(MEMORY_BANK_PREFIX)).toBe(true);
    expect(decisions[0]?.summary.startsWith(MEMORY_BANK_PREFIX)).toBe(true);
    expect(analyses.some((item) => item.summary.includes("Hidden"))).toBe(false);
  });
});
