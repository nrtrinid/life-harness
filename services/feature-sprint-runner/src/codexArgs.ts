export type CodexArgsResult =
  | { ok: true; bin: string; args: string[]; preview: string }
  | { ok: false; error: string };

export function buildCodexArgs(promptFilePath: string): CodexArgsResult {
  const bin = process.env.FEATURE_SPRINT_CODEX_BIN?.trim() || "codex";

  const args: string[] = [];
  const model = process.env.FEATURE_SPRINT_CODEX_MODEL?.trim();
  if (model) {
    args.push("--model", model);
  }

  const effort = process.env.FEATURE_SPRINT_CODEX_REASONING_EFFORT?.trim();
  if (effort) {
    args.push("--reasoning-effort", effort);
  }

  const extraArgs = process.env.FEATURE_SPRINT_CODEX_EXTRA_ARGS?.trim();
  if (extraArgs) {
    return {
      ok: false,
      error:
        "Real Codex mode is experimental. Set explicit adapter flags in codexArgs.ts after verifying `codex --help` locally."
    };
  }

  args.push("exec", "--file", promptFilePath);

  return {
    ok: true,
    bin,
    args,
    preview: `${bin} ${args.join(" ")}`
  };
}
