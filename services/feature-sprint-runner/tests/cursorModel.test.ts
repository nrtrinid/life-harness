import { afterEach, describe, expect, it } from "vitest";

import { buildCursorArgs } from "../src/cursorArgs";
import {
  extractResolvedModelFromCursorOutput,
  isSafeCursorModelId,
  resolveCursorModelForProfile
} from "../src/cursorModel";

describe("cursorModel", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("accepts official-style model ids including spaces and parameterized brackets", () => {
    expect(isSafeCursorModelId("cursor-grok-4.5-high")).toBe(true);
    expect(isSafeCursorModelId("composer-2.5")).toBe(true);
    expect(isSafeCursorModelId("claude-opus-4-8[context=1m,effort=high]")).toBe(true);
    expect(isSafeCursorModelId("Grok 4.5")).toBe(true);
  });

  it("rejects flag injection and shell metacharacters", () => {
    expect(isSafeCursorModelId("--force")).toBe(false);
    expect(isSafeCursorModelId("model&whoami")).toBe(false);
    expect(isSafeCursorModelId("model\n--force")).toBe(false);
    expect(isSafeCursorModelId('model";rm')).toBe(false);
    expect(isSafeCursorModelId("")).toBe(false);
  });

  it("prefers review override for cursor_review only", () => {
    process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL = "cursor-grok-4.5-high";
    process.env.FEATURE_SPRINT_CURSOR_MODEL = "composer-2.5";

    const review = resolveCursorModelForProfile("cursor_review");
    expect(review).toEqual({
      ok: true,
      model: "cursor-grok-4.5-high",
      source: "review"
    });

    const implementation = resolveCursorModelForProfile("cursor_implementation");
    expect(implementation).toEqual({
      ok: true,
      model: "composer-2.5",
      source: "general"
    });
  });

  it("falls back to general model when review override is unset or empty", () => {
    delete process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL;
    process.env.FEATURE_SPRINT_CURSOR_MODEL = "composer-2.5";
    expect(resolveCursorModelForProfile("cursor_review")).toEqual({
      ok: true,
      model: "composer-2.5",
      source: "general"
    });

    process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL = "   ";
    expect(resolveCursorModelForProfile("cursor_review")).toEqual({
      ok: true,
      model: "composer-2.5",
      source: "general"
    });
  });

  it("preserves unset Auto/default when no model env is set", () => {
    delete process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL;
    delete process.env.FEATURE_SPRINT_CURSOR_MODEL;
    expect(resolveCursorModelForProfile("cursor_review")).toEqual({
      ok: true,
      source: "unset"
    });
    expect(resolveCursorModelForProfile("cursor_implementation")).toEqual({
      ok: true,
      source: "unset"
    });
  });

  it("does not invent resolvedModel from request alone", () => {
    expect(extractResolvedModelFromCursorOutput("hello", "text")).toEqual({
      modelEvidenceSource: "unknown"
    });
    expect(
      extractResolvedModelFromCursorOutput(JSON.stringify({ model: "cursor-grok-4.5-high" }), "json")
    ).toEqual({
      resolvedModel: "cursor-grok-4.5-high",
      modelEvidenceSource: "cli_output"
    });
  });
});

describe("buildCursorArgs model routing", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("passes review model to cursor_review and not to implementation", () => {
    process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL = "cursor-grok-4.5-high";
    process.env.FEATURE_SPRINT_CURSOR_MODEL = "auto";

    const review = buildCursorArgs("C:/tmp/prompt.md", { profile: "cursor_review" });
    expect(review.ok).toBe(true);
    if (review.ok) {
      expect(review.requestedModel).toBe("cursor-grok-4.5-high");
      expect(review.args).toContain("--model");
      expect(review.args).toContain("cursor-grok-4.5-high");
      expect(review.args).toContain("--mode");
      expect(review.args).toContain("ask");
      expect(review.args).not.toContain("--force");
    }

    const implementation = buildCursorArgs("C:/tmp/prompt.md", {
      profile: "cursor_implementation"
    });
    expect(implementation.ok).toBe(true);
    if (implementation.ok) {
      expect(implementation.requestedModel).toBe("auto");
      expect(implementation.args).toContain("--model");
      expect(implementation.args).toContain("auto");
      expect(implementation.args).not.toContain("cursor-grok-4.5-high");
      expect(implementation.args).toContain("--force");
    }
  });

  it("keeps implementation args unchanged when only review model is configured", () => {
    delete process.env.FEATURE_SPRINT_CURSOR_MODEL;
    delete process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL;
    const baseline = buildCursorArgs("C:/tmp/prompt.md", { profile: "cursor_implementation" });

    process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL = "cursor-grok-4.5-high";
    const withReviewEnv = buildCursorArgs("C:/tmp/prompt.md", {
      profile: "cursor_implementation"
    });

    expect(baseline.ok && withReviewEnv.ok).toBe(true);
    if (baseline.ok && withReviewEnv.ok) {
      expect(withReviewEnv.args).toEqual(baseline.args);
      expect(withReviewEnv.requestedModel).toBeUndefined();
    }
  });

  it("fails closed on unsafe review model strings", () => {
    process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL = "evil&whoami";
    const result = buildCursorArgs("C:/tmp/prompt.md", { profile: "cursor_review" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unsafe");
    }
  });
});
