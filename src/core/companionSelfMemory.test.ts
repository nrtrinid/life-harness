import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyBatchedLastUsedAt,
  compactCompanionSelfMemoriesForPrompt,
  createCompanionSelfMemory,
  dedupeCompanionSelfMemories,
  formatCompanionSelfMemorySource,
  groupCompanionSelfMemoriesBySubjectAndKind,
  rejectOrDowngradeSensitiveMemory,
  requiresSensitivityConfirm,
  sanitizeCompanionSelfMemoryText
} from "./companionSelfMemory";
import {
  addCompanionSelfMemory,
  clearCompanionSelfMemories,
  flushPendingCompanionLastUsedAt,
  loadCompanionSelfMemories,
  resetCompanionSelfMemoryStoreForTests,
  saveCompanionSelfMemories
} from "./companionSelfMemoryStore";

const STORE_PATH = resolve(__dirname, "companionSelfMemoryStore.ts");

afterEach(() => {
  resetCompanionSelfMemoryStoreForTests();
});

describe("companionSelfMemory helpers", () => {
  it("sanitizes and caps text length", () => {
    const long = "x".repeat(400);
    expect(sanitizeCompanionSelfMemoryText(long).length).toBeLessThanOrEqual(280);
  });

  it("rejects S3-style sensitive content", () => {
    const result = rejectOrDowngradeSensitiveMemory({
      text: "User discussed therapy trauma in detail"
    });
    expect(result.ok).toBe(false);
  });

  it("rejects forbidden durable dependency hooks", () => {
    const result = createCompanionSelfMemory({
      kind: "self_observation",
      text: "Only I understand you and you need me",
      source: "manual_user_teaching"
    });
    expect(result.ok).toBe(false);
  });

  it("dedupes by subject and normalized text", () => {
    const first = createCompanionSelfMemory({
      kind: "self_observation",
      subject: "companion_self",
      text: "I ask for direction after autonomy speeches",
      source: "manual_user_teaching",
      confidence: 0.4
    });
    const second = createCompanionSelfMemory({
      kind: "self_observation",
      subject: "companion_self",
      text: "  i ask for direction after autonomy speeches ",
      source: "user_approved_proposal",
      confidence: 0.9
    });
    if (!first.ok || !second.ok) {
      throw new Error("expected memories");
    }
    const deduped = dedupeCompanionSelfMemories([first.memory, second.memory]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.confidence).toBe(0.9);
  });

  it("compacts injected memories by budget level", () => {
    const memories = Array.from({ length: 10 }, (_, index) => {
      const created = createCompanionSelfMemory({
        kind: "style_trait",
        text: `Trait ${index}`,
        source: "manual_user_teaching",
        confidence: index / 10
      });
      if (!created.ok) {
        throw new Error("expected memory");
      }
      return created.memory;
    });
    expect(
      compactCompanionSelfMemoriesForPrompt({ memories, level: "aggressive" }).length
    ).toBeLessThanOrEqual(3);
  });

  it("groups by subject then kind", () => {
    const a = createCompanionSelfMemory({
      kind: "style_trait",
      subject: "companion_self",
      text: "Blunt voice",
      source: "manual_user_teaching"
    });
    const b = createCompanionSelfMemory({
      kind: "anti_pattern",
      subject: "companion_self",
      text: "Loops on autonomy",
      source: "manual_user_teaching"
    });
    if (!a.ok || !b.ok) {
      throw new Error("expected memories");
    }
    const grouped = groupCompanionSelfMemoriesBySubjectAndKind([a.memory, b.memory]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.kindGroups).toHaveLength(2);
  });

  it("flags S2 for confirm-in-edit", () => {
    expect(requiresSensitivityConfirm("S2")).toBe(true);
    expect(requiresSensitivityConfirm("S0")).toBe(false);
  });

  it("formats source labels", () => {
    expect(formatCompanionSelfMemorySource("user_approved_proposal")).toBe("Approved proposal");
  });

  it("batches lastUsedAt in one pass", () => {
    const created = createCompanionSelfMemory({
      kind: "self_observation",
      text: "Initiative note",
      source: "manual_user_teaching"
    });
    if (!created.ok) {
      throw new Error("expected memory");
    }
    const updated = applyBatchedLastUsedAt({
      memories: [created.memory],
      usedIds: [created.memory.id],
      timestamp: "2026-06-09T12:00:00.000Z"
    });
    expect(updated[0]?.lastUsedAt).toBe("2026-06-09T12:00:00.000Z");
  });
});

describe("companionSelfMemoryStore", () => {
  it("flushes pending lastUsedAt to storage", () => {
    const created = createCompanionSelfMemory({
      kind: "self_observation",
      text: "Note",
      source: "manual_user_teaching"
    });
    if (!created.ok) {
      throw new Error("expected memory");
    }
    saveCompanionSelfMemories([created.memory]);
    flushPendingCompanionLastUsedAt([created.memory.id]);
    expect(loadCompanionSelfMemories()[0]?.lastUsedAt).toBeTruthy();
  });

  it("persists and reloads on web-like localStorage", () => {
    const created = createCompanionSelfMemory({
      kind: "learned_preference",
      subject: "user_preference",
      text: "Prefer emergent personality",
      source: "manual_user_teaching"
    });
    if (!created.ok) {
      throw new Error("expected memory");
    }
    addCompanionSelfMemory(created.memory);
    expect(loadCompanionSelfMemories()).toHaveLength(1);
    clearCompanionSelfMemories();
    expect(loadCompanionSelfMemories()).toHaveLength(0);
  });

  it("recovers from malformed JSON", () => {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem("life-harness:companion-self-memory:v1", "{not json");
    expect(loadCompanionSelfMemories()).toEqual([]);
    saveCompanionSelfMemories([]);
  });

  it("does not import harness modules", () => {
    const source = readFileSync(STORE_PATH, "utf8");
    expect(source).not.toMatch(/harnessContext/);
    expect(source).not.toMatch(/harnessMemory/);
    expect(source).not.toMatch(/useLifeHarness/);
  });
});
