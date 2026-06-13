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

export function buildCodexArgs(_promptFilePath: string): CodexArgsResult {
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

  args.push("exec", "-");

  return {
    ok: true,
    bin,
    args,
    preview: `${bin} ${args.join(" ")} < prompt.md`,
    feedPromptViaStdin: true
  };
}
