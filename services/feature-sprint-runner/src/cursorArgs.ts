import type { FeatureSprintRunnerProfile } from "../../../src/core/featureSprintRunner";
import {
  isImplementationProfile,
  isReviewProfile,
  isScopingProfile
} from "../../../src/core/featureSprintRunner";

export type CursorArgsResult =
  | { ok: true; bin: string; args: string[]; preview: string; promptFilePath: string }
  | { ok: false; error: string };

export function normalizePromptFilePathForCursor(promptFilePath: string): string {
  return promptFilePath.replace(/\\/g, "/");
}

function resolveCursorOutputFormat(): "text" | "json" {
  const configured = process.env.FEATURE_SPRINT_CURSOR_OUTPUT_FORMAT?.trim().toLowerCase();
  return configured === "json" ? "json" : "text";
}

export type BuildCursorArgsOptions = {
  /** Isolated worktree or repo root the agent should treat as workspace. */
  workspacePath?: string;
  /** Profile drives read-only vs write flags. */
  profile?: FeatureSprintRunnerProfile;
};

function isReadOnlyProfile(profile: FeatureSprintRunnerProfile | undefined): boolean {
  if (!profile) {
    return false;
  }
  return isScopingProfile(profile) || isReviewProfile(profile);
}

/**
 * Build Cursor `agent` CLI args.
 *
 * Confirmed against installed `agent --help` (2026.06.12):
 * - `-p/--print` headless output to console (stdout)
 * - `--output-format text|json|stream-json` (only with `--print`)
 * - `--mode ask` / `--mode plan` are both read-only; Feature Sprint uses `ask` for
 *   scoping/review because real `plan` smokes exited 0 with empty stdout capture
 * - `--force` + `--trust` for implementation writes in headless mode
 * - `--workspace` sets workspace directory
 */
export function buildCursorArgs(
  promptFilePath: string,
  options?: BuildCursorArgsOptions
): CursorArgsResult {
  const bin = process.env.FEATURE_SPRINT_CURSOR_BIN?.trim() || "agent";
  const normalizedPath = normalizePromptFilePathForCursor(promptFilePath);
  const readOnly = isReadOnlyProfile(options?.profile);

  const args: string[] = ["-p"];

  if (readOnly) {
    // Prefer ask over plan for printable stdout under `-p` (see module doc).
    args.push("--mode", "ask", "--trust");
  } else {
    // Implementation (and unknown) retain force/trust — required for non-interactive writes.
    args.push("--force", "--trust");
  }

  args.push("--output-format", resolveCursorOutputFormat());

  const workspacePath = options?.workspacePath?.trim();
  if (workspacePath) {
    args.push("--workspace", normalizePromptFilePathForCursor(workspacePath));
  }

  const model = process.env.FEATURE_SPRINT_CURSOR_MODEL?.trim();
  if (model) {
    args.push("--model", model);
  }

  const phaseHint = readOnly
    ? "This is a read-only feature sprint phase. Do not edit files or run mutating shell commands. Print your full answer to stdout."
    : isImplementationProfile(options?.profile ?? "cursor_implementation")
      ? "Implement only inside the assigned workspace/worktree."
      : "Follow the prompt exactly.";

  const prompt =
    `Execute the feature sprint task documented in ${normalizedPath}. ` +
    `${phaseHint} ` +
    "Read that file first, follow it exactly, and include any required fenced JSON blocks in your printed response.";

  args.push(prompt);

  return {
    ok: true,
    bin,
    args,
    preview: `${bin} ${args.slice(0, -1).join(" ")} "<prompt>"`,
    promptFilePath: normalizedPath
  };
}
