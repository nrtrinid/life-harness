import { afterEach, describe, expect, it } from "vitest";

import { buildCursorArgs } from "../src/cursorArgs";

describe("cursorArgs", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("builds headless agent args with prompt file reference", () => {
    const result = buildCursorArgs("C:/tmp/prompt.md");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bin).toBe("agent");
      expect(result.args).toEqual([
        "-p",
        "--force",
        "--output-format",
        "text",
        expect.stringContaining("C:/tmp/prompt.md")
      ]);
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

  it("honors FEATURE_SPRINT_CURSOR_BIN and model", () => {
    process.env.FEATURE_SPRINT_CURSOR_BIN = "cursor-agent";
    process.env.FEATURE_SPRINT_CURSOR_MODEL = "composer-2.5";

    const result = buildCursorArgs("/tmp/prompt.md");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bin).toBe("cursor-agent");
      expect(result.args).toContain("--model");
      expect(result.args).toContain("composer-2.5");
    }
  });
});
