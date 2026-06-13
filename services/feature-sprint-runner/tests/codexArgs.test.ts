import { describe, expect, it } from "vitest";

import { buildCodexArgs } from "../src/codexArgs";

describe("buildCodexArgs", () => {
  it("uses codex exec with stdin prompt instead of deprecated --file", () => {
    const result = buildCodexArgs("/tmp/prompt.md");
    expect(result).toMatchObject({
      ok: true,
      bin: "codex",
      args: ["exec", "-"],
      feedPromptViaStdin: true
    });
    expect(result.ok && result.preview).toContain("< prompt.md");
    expect(result.ok && result.args).not.toContain("--file");
  });

  it("passes model and reasoning effort via supported flags", () => {
    const previousModel = process.env.FEATURE_SPRINT_CODEX_MODEL;
    const previousEffort = process.env.FEATURE_SPRINT_CODEX_REASONING_EFFORT;
    process.env.FEATURE_SPRINT_CODEX_MODEL = "o3";
    process.env.FEATURE_SPRINT_CODEX_REASONING_EFFORT = "high";

    try {
      const result = buildCodexArgs("/tmp/prompt.md");
      expect(result).toMatchObject({
        ok: true,
        args: ["-m", "o3", "-c", 'model_reasoning_effort="high"', "exec", "-"]
      });
    } finally {
      if (previousModel === undefined) {
        delete process.env.FEATURE_SPRINT_CODEX_MODEL;
      } else {
        process.env.FEATURE_SPRINT_CODEX_MODEL = previousModel;
      }
      if (previousEffort === undefined) {
        delete process.env.FEATURE_SPRINT_CODEX_REASONING_EFFORT;
      } else {
        process.env.FEATURE_SPRINT_CODEX_REASONING_EFFORT = previousEffort;
      }
    }
  });
});
