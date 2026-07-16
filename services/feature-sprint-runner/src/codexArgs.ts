import type { FeatureSprintRunnerProfile } from "../../../src/core/featureSprintRunner";
import {
  isImplementationProfile,
  isReviewProfile,
  isScopingProfile
} from "../../../src/core/featureSprintRunner";

export type CodexArgsResult =
  | {
      ok: true;
      bin: string;
      args: string[];
      preview: string;
      /** Prompt is written to stdin (codex exec reads `-` from stdin). */
      feedPromptViaStdin: true;
    }
  | { ok: false; error: string };

export type BuildCodexArgsOptions = {
  workspacePath?: string;
  profile?: FeatureSprintRunnerProfile;
};

function resolveSandbox(
  profile: FeatureSprintRunnerProfile | undefined
): "read-only" | "workspace-write" {
  if (!profile) {
    return "read-only";
  }
  if (isImplementationProfile(profile)) {
    return "workspace-write";
  }
  if (isScopingProfile(profile) || isReviewProfile(profile)) {
    return "read-only";
  }
  // prompt_audit and unknown → read-only by default
  return "read-only";
}

/**
 * Build Codex CLI args.
 *
 * Confirmed against `codex exec --help`:
 * - `exec -` reads prompt from stdin
 * - `-s/--sandbox read-only|workspace-write|danger-full-access`
 * - `-C/--cd` sets working root
 * - `-m` model, `-c key=value` config overrides
 */
export function buildCodexArgs(
  _promptFilePath: string,
  options?: BuildCodexArgsOptions
): CodexArgsResult {
  const bin = process.env.FEATURE_SPRINT_CODEX_BIN?.trim() || "codex";

  const args: string[] = [];
  const model = process.env.FEATURE_SPRINT_CODEX_MODEL?.trim();
  if (model) {
    args.push("-m", model);
  }

  const effort = process.env.FEATURE_SPRINT_CODEX_REASONING_EFFORT?.trim();
  if (effort) {
    args.push("-c", `model_reasoning_effort="${effort}"`);
  }

  const extraArgs = process.env.FEATURE_SPRINT_CODEX_EXTRA_ARGS?.trim();
  if (extraArgs) {
    return {
      ok: false,
      error:
        "Real Codex mode is experimental. Set explicit adapter flags in codexArgs.ts after verifying `codex exec --help` locally."
    };
  }

  const workspacePath = options?.workspacePath?.trim();
  if (workspacePath) {
    args.push("-C", workspacePath);
  }

  args.push("exec", "-s", resolveSandbox(options?.profile), "-");

  return {
    ok: true,
    bin,
    args,
    preview: `${bin} ${args.join(" ")} < prompt.md`,
    feedPromptViaStdin: true
  };
}
