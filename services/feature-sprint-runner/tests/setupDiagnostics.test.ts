import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkRealCodexGate,
  checkRealCursorGate,
  collectSetupMissingEnv
} from "../src/providerGates";
import { buildSetupDiagnostics } from "../src/setupDiagnostics";

describe("providerGates", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("mock mode has no missing env", () => {
    delete process.env.FEATURE_SPRINT_RUNNER_MODE;
    expect(collectSetupMissingEnv("mock")).toEqual([]);
  });

  it("cursor mode lists missing cursor env keys", () => {
    process.env.FEATURE_SPRINT_RUNNER_MODE = "cursor";
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_CURSOR;
    delete process.env.FEATURE_SPRINT_RUNNER_TOKEN;
    delete process.env.CURSOR_API_KEY;
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION;

    const missing = collectSetupMissingEnv("cursor");
    expect(missing).toContain("FEATURE_SPRINT_RUNNER_ENABLE_CURSOR");
    expect(missing).toContain("FEATURE_SPRINT_RUNNER_TOKEN");
    expect(missing).toContain("CURSOR_API_KEY");
    expect(missing).toContain("FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION");
  });

  it("codex gate passes when env is set", () => {
    process.env.FEATURE_SPRINT_RUNNER_ENABLE_CODEX = "1";
    process.env.FEATURE_SPRINT_RUNNER_TOKEN = "dev";
    expect(checkRealCodexGate()).toEqual({ ok: true, missingEnv: [] });
  });

  it("cursor gate lists missing keys", () => {
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_CURSOR;
    delete process.env.FEATURE_SPRINT_RUNNER_TOKEN;
    delete process.env.CURSOR_API_KEY;

    const gate = checkRealCursorGate();
    expect(gate.ok).toBe(false);
    expect(gate.missingEnv).toEqual([
      "FEATURE_SPRINT_RUNNER_ENABLE_CURSOR",
      "FEATURE_SPRINT_RUNNER_TOKEN",
      "CURSOR_API_KEY"
    ]);
  });
});

describe("buildSetupDiagnostics", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("returns mock recommended script in mock mode", async () => {
    delete process.env.FEATURE_SPRINT_RUNNER_MODE;
    delete process.env.FEATURE_SPRINT_RUNNER_TOKEN;
    const setup = await buildSetupDiagnostics();
    expect(setup.recommendedScript).toBe("mock");
    expect(setup.missingEnv).toEqual([]);
    expect(setup.serverTokenConfigured).toBe(false);
  });
});
