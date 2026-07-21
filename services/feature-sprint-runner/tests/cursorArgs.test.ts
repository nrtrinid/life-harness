import { afterEach, describe, expect, it } from "vitest";

import { buildCursorArgs } from "../src/cursorArgs";

describe("cursorArgs", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("builds headless implementation args with force/trust", () => {
    delete process.env.FEATURE_SPRINT_CURSOR_MODEL;
    const result = buildCursorArgs("C:/tmp/prompt.md", { profile: "cursor_implementation" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bin).toBe("agent");
      expect(result.args).toEqual([
        "-p",
        "--force",
        "--trust",
        "--output-format",
        "text",
        expect.stringContaining("C:/tmp/prompt.md")
      ]);
    }
  });

  it("uses read-only ask mode for scoping and review", () => {
    const scoping = buildCursorArgs("C:/tmp/prompt.md", { profile: "cursor_scoping" });
    expect(scoping.ok).toBe(true);
    if (scoping.ok) {
      expect(scoping.args).toContain("--mode");
      expect(scoping.args).toContain("ask");
      expect(scoping.args).not.toContain("--force");
      expect(scoping.args).toContain("--output-format");
      expect(scoping.args).toContain("text");
      expect(scoping.args.at(-1)).toContain("read-only");
    }

    const review = buildCursorArgs("C:/tmp/prompt.md", { profile: "cursor_review" });
    expect(review.ok).toBe(true);
    if (review.ok) {
      expect(review.args).toContain("--mode");
      expect(review.args).toContain("ask");
    }
  });

  it("normalizes Windows prompt paths to forward slashes", () => {
    const result = buildCursorArgs("C:\\Users\\me\\AppData\\Local\\Temp\\prompt.md");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.promptFilePath).toBe("C:/Users/me/AppData/Local/Temp/prompt.md");
      expect(result.args.at(-1)).toContain("C:/Users/me/AppData/Local/Temp/prompt.md");
    }
  });

  it("passes workspace path for headless trust in isolated worktrees", () => {
    const result = buildCursorArgs("C:/tmp/prompt.md", {
      workspacePath: "C:\\worktrees\\life-harness\\feature-step-abc",
      profile: "cursor_implementation"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.args).toContain("--workspace");
      expect(result.args).toContain("C:/worktrees/life-harness/feature-step-abc");
    }
  });

  it("honors FEATURE_SPRINT_CURSOR_BIN and model", () => {
    process.env.FEATURE_SPRINT_CURSOR_BIN = "cursor-agent";
    process.env.FEATURE_SPRINT_CURSOR_MODEL = "composer-2.5";

    const result = buildCursorArgs("/tmp/prompt.md", { profile: "cursor_implementation" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bin).toBe("cursor-agent");
      expect(result.args).toContain("--model");
      expect(result.args).toContain("composer-2.5");
    }
  });
});
