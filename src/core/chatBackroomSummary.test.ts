import { describe, expect, it } from "vitest";

import {
  buildCompanionStateChips,
  buildRawLabStateChips,
  countRawLabPersonalityItems,
  countRawLabThreadMemoryItems,
  formatBudgetChipLabel,
  formatCompanionModeChip
} from "./chatBackroomSummary";
import { createEmptyRawLabThreadState, pinFact } from "./rawLabThreadState";

describe("formatBudgetChipLabel", () => {
  it("returns Budget OK when no pressure", () => {
    expect(formatBudgetChipLabel({ level: "none" })).toBe("Budget OK");
    expect(formatBudgetChipLabel({})).toBe("Budget OK");
  });

  it("returns Compact soon for trim_history or compaction notice", () => {
    expect(formatBudgetChipLabel({ level: "trim_history" })).toBe("Compact soon");
    expect(formatBudgetChipLabel({ hasCompactionNotice: true })).toBe("Compact soon");
  });

  it("returns Budget warning for aggressive levels or over budget", () => {
    expect(formatBudgetChipLabel({ level: "compact_state" })).toBe("Budget warning");
    expect(formatBudgetChipLabel({ level: "aggressive" })).toBe("Budget warning");
    expect(formatBudgetChipLabel({ promptOverBudget: true })).toBe("Budget warning");
  });
});

describe("raw lab counts", () => {
  it("counts thread memory items", () => {
    const state = pinFact(createEmptyRawLabThreadState(), "likes speculative riffs");
    expect(countRawLabThreadMemoryItems(state)).toBe(1);
  });

  it("counts personality items", () => {
    expect(countRawLabPersonalityItems(createEmptyRawLabThreadState())).toBe(0);
  });
});

describe("buildRawLabStateChips", () => {
  it("includes Ungrounded and Backroom", () => {
    const chips = buildRawLabStateChips({
      threadMemoryCount: 2,
      signalNotesCount: 1,
      personalityCount: 0,
      budget: { level: "none" }
    });
    expect(chips.some((chip) => chip.label === "Ungrounded")).toBe(true);
    expect(chips.some((chip) => chip.label === "Backroom")).toBe(true);
    expect(chips.some((chip) => chip.label === "2 thread memories")).toBe(true);
  });
});

describe("buildCompanionStateChips", () => {
  it("includes Grounded and board context ready", () => {
    const chips = buildCompanionStateChips({
      boardContextReady: true,
      activeMemoryCount: 3,
      memoryItemCount: 12,
      mode: "general",
      reasoningDepth: "fast",
      budget: { level: "none" }
    });
    expect(chips.some((chip) => chip.label === "Grounded")).toBe(true);
    expect(chips.some((chip) => chip.label === "Board context ready")).toBe(true);
    expect(chips.some((chip) => chip.label === "Budget OK")).toBe(true);
  });

  it("formats mode chip", () => {
    expect(formatCompanionModeChip("operator", "fast")).toBe("Mode: Operator");
    expect(formatCompanionModeChip("general", "deep")).toBe("Mode: Deep");
  });
});
