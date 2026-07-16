import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildRunnerResult } from "../src/resultEnvelope";

const scriptsDir = path.resolve(__dirname, "../scripts");

describe("real smoke mock rejection", () => {
  it("real-profile and cursor-content smokes reject mock mode", () => {
    const real = readFileSync(path.join(scriptsDir, "smoke_real_profiles.ps1"), "utf8");
    const content = readFileSync(path.join(scriptsDir, "smoke_cursor_content.ps1"), "utf8");
    for (const script of [real, content]) {
      expect(script).toContain("mock_mode_not_real");
      expect(script).toContain("runnerMode");
      expect(script).toMatch(/mock:/);
      expect(script).toContain("SMOKE_STATUS=failed");
    }
  });
});

describe("runId preservation on usability rebuild", () => {
  it("keeps the original runId when rebuilding an empty_output envelope", () => {
    const original = buildRunnerResult({
      ok: true,
      profile: "cursor_implementation",
      runnerMode: "cursor",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      outputText: "",
      terminationReason: "completed",
      runId: "original-run-id"
    });

    const rebuilt = buildRunnerResult({
      ok: false,
      profile: "cursor_implementation",
      runnerMode: "cursor",
      runId: original.runId,
      startedAt: original.startedAt,
      completedAt: original.completedAt,
      outputText: original.outputText,
      terminationReason: "completed",
      failureClass: "empty_output",
      resultUsability: "empty_output",
      changedFiles: []
    });

    expect(rebuilt.runId).toBe("original-run-id");
    expect(rebuilt.ok).toBe(false);
    expect(rebuilt.failureClass).toBe("empty_output");
  });
});
