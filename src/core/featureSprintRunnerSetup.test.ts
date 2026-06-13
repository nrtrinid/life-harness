import { describe, expect, it } from "vitest";

import {
  classifyRunnerHealthFailure,
  FEATURE_SPRINT_RUNNER_UNAUTHORIZED_MESSAGE,
  parseFeatureSprintRunnerHealthBody
} from "./featureSprintRunnerHealth";
import {
  buildRunnerSetupGuide,
  runnerSetupSummaryTitle
} from "./featureSprintRunnerSetup";

describe("classifyRunnerHealthFailure", () => {
  it("classifies 401 as unauthorized", () => {
    expect(
      classifyRunnerHealthFailure(undefined, {
        httpStatus: 401,
        appTokenConfigured: false
      })
    ).toBe("unauthorized");
  });

  it("classifies network failure as unreachable", () => {
    expect(classifyRunnerHealthFailure(undefined)).toBe("unreachable");
  });

  it("classifies misconfigured health body", () => {
    expect(
      classifyRunnerHealthFailure(
        {
          ok: false,
          mode: "cursor",
          error: "missing keys",
          setup: {
            serverTokenRequired: true,
            serverTokenConfigured: true,
            missingEnv: ["CURSOR_API_KEY"],
            cli: { detected: false },
            recommendedScript: "cursor"
          }
        },
        { appTokenConfigured: true }
      )
    ).toBe("misconfigured");
  });

  it("classifies agent unavailable when health ok but agent not ready", () => {
    expect(
      classifyRunnerHealthFailure(
        {
          ok: true,
          mode: "codex",
          codexAvailable: true,
          cursorAvailable: false
        },
        { appTokenConfigured: true, runnerAgent: "cursor" }
      )
    ).toBe("agentUnavailable");
  });
});

describe("parseFeatureSprintRunnerHealthBody setup", () => {
  it("parses setup snapshot from health payload", () => {
    const probe = parseFeatureSprintRunnerHealthBody({
      ok: true,
      mode: "cursor",
      codexAvailable: false,
      cursorAvailable: true,
      setup: {
        serverTokenRequired: true,
        serverTokenConfigured: true,
        missingEnv: [],
        cli: { detected: true, bin: "agent", version: "2026.06.12" },
        platform: "win32",
        recommendedScript: "cursor"
      }
    });

    expect(probe.setup?.cli.detected).toBe(true);
    expect(probe.setup?.recommendedScript).toBe("cursor");
  });
});

describe("buildRunnerSetupGuide", () => {
  it("returns token steps for unauthorized failures", () => {
    const steps = buildRunnerSetupGuide({
      runnerAgent: "cursor",
      appTokenConfigured: false,
      probe: {
        ok: false,
        failureKind: "unauthorized",
        error: FEATURE_SPRINT_RUNNER_UNAUTHORIZED_MESSAGE
      },
      httpStatus: 401
    });

    expect(steps[0]?.id).toBe("app_token");
    expect(steps.some((step) => step.command?.includes("EXPO_PUBLIC"))).toBe(true);
  });

  it("returns start commands when runner is unreachable", () => {
    const steps = buildRunnerSetupGuide({
      runnerAgent: "codex",
      appTokenConfigured: true,
      probe: { ok: false, failureKind: "unreachable" }
    });

    expect(steps.some((step) => step.command?.includes("feature-runner"))).toBe(true);
  });

  it("returns cursor env steps when keys are missing", () => {
    const steps = buildRunnerSetupGuide({
      runnerAgent: "cursor",
      appTokenConfigured: true,
      platform: "windows",
      probe: {
        ok: false,
        mode: "cursor",
        setup: {
          serverTokenRequired: true,
          serverTokenConfigured: false,
          missingEnv: ["CURSOR_API_KEY", "FEATURE_SPRINT_RUNNER_ENABLE_CURSOR"],
          cli: { detected: false },
          recommendedScript: "cursor"
        }
      }
    });

    expect(steps.some((step) => step.id === "env_file")).toBe(true);
    expect(steps.some((step) => step.id === "start_cursor")).toBe(true);
  });
});

describe("runnerSetupSummaryTitle", () => {
  it("labels unauthorized failures", () => {
    expect(runnerSetupSummaryTitle("unauthorized", "cursor")).toBe("Runner token mismatch");
  });
});
