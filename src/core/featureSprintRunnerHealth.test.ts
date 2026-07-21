import { describe, expect, it } from "vitest";

import {
  buildRunnerAgentUnavailableHint,
  formatRunnerHealthCapabilityLine,
  guardRunnerAgentAvailability,
  isRunnerAgentAvailable,
  parseFeatureSprintRunnerHealthBody
} from "./featureSprintRunnerHealth";

describe("featureSprintRunnerHealth", () => {
  it("parses mock health with both providers available", () => {
    const probe = parseFeatureSprintRunnerHealthBody({
      ok: true,
      mode: "mock",
      codexAvailable: true,
      cursorAvailable: true
    });
    expect(probe).toEqual({
      ok: true,
      mode: "mock",
      codexAvailable: true,
      cursorAvailable: true
    });
  });

  it("formats capability line for available mock runner", () => {
    expect(
      formatRunnerHealthCapabilityLine({
        ok: true,
        mode: "mock",
        codexAvailable: true,
        cursorAvailable: true
      })
    ).toBe("available (mock) · Codex ready · Cursor ready");
  });

  it("treats both agents as available in mock mode", () => {
    const probe = {
      ok: true,
      mode: "mock" as const,
      codexAvailable: true,
      cursorAvailable: true
    };
    expect(isRunnerAgentAvailable(probe, "cursor")).toBe(true);
    expect(isRunnerAgentAvailable(probe, "codex")).toBe(true);
    expect(guardRunnerAgentAvailability("cursor", probe)).toBeUndefined();
  });

  it("guards cursor when cursor is unavailable in codex mode", () => {
    const probe = {
      ok: true,
      mode: "codex" as const,
      codexAvailable: true,
      cursorAvailable: false
    };
    expect(isRunnerAgentAvailable(probe, "cursor")).toBe(false);
    expect(guardRunnerAgentAvailability("cursor", probe)).toContain("Cursor runs are unavailable");
    expect(buildRunnerAgentUnavailableHint("cursor", probe)).toContain("Runner setup");
  });

  it("allows Cursor when Codex is disabled in real mode", () => {
    const probe = {
      ok: true,
      mode: "real" as const,
      codexAvailable: false,
      cursorAvailable: true
    };
    expect(isRunnerAgentAvailable(probe, "cursor")).toBe(true);
    expect(isRunnerAgentAvailable(probe, "codex")).toBe(false);
    expect(guardRunnerAgentAvailability("cursor", probe)).toBeUndefined();
    expect(guardRunnerAgentAvailability("codex", probe)).toContain("Codex runs are unavailable");
  });
});
