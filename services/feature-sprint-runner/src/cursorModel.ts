import type { FeatureSprintRunnerProfile } from "../../../src/core/featureSprintRunner";
import { isReviewProfile } from "../../../src/core/featureSprintRunner";

export type CursorModelResolveSource = "review" | "general" | "unset";

export type CursorModelResolveResult =
  | { ok: true; model?: string; source: CursorModelResolveSource }
  | { ok: false; error: string };

/**
 * Validate a Cursor `--model` value for argv safety.
 * Allows official ids with letters, digits, `.` `_` `-` `/` spaces and parameterized
 * bracket forms like `claude-opus-4-8[context=1m,effort=high]`.
 * Rejects flag injection, newlines, and shell metacharacters.
 */
export function isSafeCursorModelId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/[\r\n\0]/.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith("-")) {
    return false;
  }
  if (/[&|<>^%`$;'"\\]/.test(trimmed)) {
    return false;
  }
  // Disallow whitespace-only control and ASCII control chars.
  if (/[\u0001-\u001f\u007f]/.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Resolve which Cursor model (if any) to pass for a profile.
 *
 * Precedence for review profiles:
 *   FEATURE_SPRINT_CURSOR_REVIEW_MODEL → FEATURE_SPRINT_CURSOR_MODEL → unset (CLI Auto/default)
 *
 * Implementation and non-review profiles never read the review-only override.
 */
export function resolveCursorModelForProfile(
  profile?: FeatureSprintRunnerProfile
): CursorModelResolveResult {
  const review = profile !== undefined && isReviewProfile(profile);

  if (review) {
    const rawReview = process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL;
    if (rawReview !== undefined) {
      const reviewModel = rawReview.trim();
      if (reviewModel) {
        if (!isSafeCursorModelId(reviewModel)) {
          return {
            ok: false,
            error:
              "FEATURE_SPRINT_CURSOR_REVIEW_MODEL contains unsafe characters for --model."
          };
        }
        return { ok: true, model: reviewModel, source: "review" };
      }
      // Empty / whitespace-only override → treat as unset and fall through.
    }
  }

  const generalRaw = process.env.FEATURE_SPRINT_CURSOR_MODEL;
  if (generalRaw !== undefined) {
    const generalModel = generalRaw.trim();
    if (generalModel) {
      if (!isSafeCursorModelId(generalModel)) {
        return {
          ok: false,
          error: "FEATURE_SPRINT_CURSOR_MODEL contains unsafe characters for --model."
        };
      }
      return { ok: true, model: generalModel, source: "general" };
    }
  }

  return { ok: true, source: "unset" };
}

export type CursorModelEvidenceSource = "request" | "cli_output" | "runner" | "unknown";

/**
 * Best-effort extraction of confirmed model identity from Cursor CLI output.
 * Never invents a resolved model from the request alone.
 */
export function extractResolvedModelFromCursorOutput(
  stdout: string | undefined,
  outputFormat: "text" | "json"
): { resolvedModel?: string; modelEvidenceSource: CursorModelEvidenceSource } {
  const text = stdout?.trim() ?? "";
  if (!text) {
    return { modelEvidenceSource: "unknown" };
  }

  if (outputFormat === "json") {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const candidates = [parsed.model, parsed.modelId, parsed.model_name];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          return {
            resolvedModel: candidate.trim(),
            modelEvidenceSource: "cli_output"
          };
        }
      }
      const response =
        parsed.response && typeof parsed.response === "object"
          ? (parsed.response as Record<string, unknown>)
          : undefined;
      if (response && typeof response.model === "string" && response.model.trim()) {
        return {
          resolvedModel: response.model.trim(),
          modelEvidenceSource: "cli_output"
        };
      }
    } catch {
      // Not JSON — fall through.
    }
  }

  return { modelEvidenceSource: "unknown" };
}
