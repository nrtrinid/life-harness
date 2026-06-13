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

export function buildCursorArgs(promptFilePath: string): CursorArgsResult {
  const bin = process.env.FEATURE_SPRINT_CURSOR_BIN?.trim() || "agent";
  const normalizedPath = normalizePromptFilePathForCursor(promptFilePath);

  const args: string[] = ["-p", "--force", "--output-format", resolveCursorOutputFormat()];

  const model = process.env.FEATURE_SPRINT_CURSOR_MODEL?.trim();
  if (model) {
    args.push("--model", model);
  }

  const prompt =
    `Execute the feature sprint task documented in ${normalizedPath}. ` +
    "Read that file first, follow it exactly, and include any required fenced JSON blocks in your response.";

  args.push(prompt);

  return {
    ok: true,
    bin,
    args,
    preview: `${bin} ${args.slice(0, -1).join(" ")} "<prompt>"`,
    promptFilePath: normalizedPath
  };
}
