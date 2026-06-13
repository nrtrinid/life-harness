import type { FeatureSprintRunnerAgent } from "./featureSprintRunner";
import { runnerAgentLabel } from "./featureSprintRunner";
import type {
  FeatureSprintRunnerHealthFailureKind,
  FeatureSprintRunnerHealthProbe
} from "./featureSprintRunnerHealth";
import { classifyRunnerHealthFailure } from "./featureSprintRunnerHealth";

export type RunnerSetupPlatform = "windows" | "unix" | "unknown";

export type RunnerSetupGuideStep = {
  id: string;
  title: string;
  detail: string;
  command?: string;
};

export type RunnerSetupGuideInput = {
  probe?: FeatureSprintRunnerHealthProbe;
  httpStatus?: number;
  runnerAgent: FeatureSprintRunnerAgent;
  appTokenConfigured: boolean;
  platform?: RunnerSetupPlatform;
  showAllCommands?: boolean;
};

function resolvePlatform(platform?: RunnerSetupPlatform): RunnerSetupPlatform {
  return platform ?? "unknown";
}

function mockStartCommand(_platform: RunnerSetupPlatform): string {
  return "npm run feature-runner:mock";
}

function cursorStartCommand(_platform: RunnerSetupPlatform): string {
  return "npm run feature-runner:cursor";
}

function cursorCliInstallCommand(platform: RunnerSetupPlatform): string {
  if (platform === "windows") {
    return "irm 'https://cursor.com/install?win32=true' | iex";
  }
  return "curl https://cursor.com/install -fsS | bash";
}

function envFileHint(platform: RunnerSetupPlatform): string {
  const path =
    platform === "windows"
      ? "services\\feature-sprint-runner\\.env.local"
      : "services/feature-sprint-runner/.env.local";
  return `Copy services/feature-sprint-runner/.env.local.example to ${path} and set CURSOR_API_KEY.`;
}

function buildMockGuide(platform: RunnerSetupPlatform): RunnerSetupGuideStep[] {
  return [
    {
      id: "start_mock",
      title: "Start the mock runner",
      detail: "Mock mode needs no API keys. Keep this terminal open while using Feature Sprint.",
      command: mockStartCommand(platform)
    },
    {
      id: "check_runner",
      title: "Check runner in Start feature",
      detail: "Return here and click Check runner. Status should show available (mock)."
    }
  ];
}

function buildCursorGuide(
  probe: FeatureSprintRunnerHealthProbe | undefined,
  platform: RunnerSetupPlatform
): RunnerSetupGuideStep[] {
  const steps: RunnerSetupGuideStep[] = [];

  if (probe?.setup?.missingEnv.includes("CURSOR_API_KEY") || probe?.setup?.missingEnv.length) {
    steps.push({
      id: "env_file",
      title: "Configure runner secrets",
      detail: envFileHint(platform),
      command: "copy services\\feature-sprint-runner\\.env.local.example services\\feature-sprint-runner\\.env.local"
    });
  }

  if (probe?.setup && !probe.setup.cli.detected) {
    steps.push({
      id: "install_cli",
      title: "Install Cursor CLI",
      detail: "Verify with agent --version after install.",
      command: cursorCliInstallCommand(platform)
    });
  }

  steps.push({
    id: "start_cursor",
    title: "Start the Cursor runner",
    detail: "Loads .env.local and runs npm run feature-runner in cursor mode.",
    command: cursorStartCommand(platform)
  });

  steps.push({
    id: "check_runner",
    title: "Check runner again",
    detail: "Status should show available (cursor) · Cursor ready."
  });

  return steps;
}

function buildCodexGuide(platform: RunnerSetupPlatform): RunnerSetupGuideStep[] {
  return [
    {
      id: "env_codex",
      title: "Set Codex runner env",
      detail:
        "In your runner terminal: FEATURE_SPRINT_RUNNER_MODE=codex, FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1, FEATURE_SPRINT_RUNNER_TOKEN, and FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION=1 for implementation runs."
    },
    {
      id: "start_runner",
      title: "Start the runner",
      detail: "From repo root after env is set.",
      command: platform === "windows" ? "npm run feature-runner" : "npm run feature-runner"
    },
    {
      id: "check_runner",
      title: "Check runner again",
      detail: "Status should show available (codex) · Codex ready."
    }
  ];
}

function buildTokenGuide(): RunnerSetupGuideStep[] {
  return [
    {
      id: "app_token",
      title: "Pair app and runner tokens",
      detail:
        "Set EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN in .env to the same value as FEATURE_SPRINT_RUNNER_TOKEN on the runner. Restart Expo after changing .env.",
      command: "EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN=life-harness-dev"
    },
    {
      id: "check_runner",
      title: "Check runner again",
      detail: "401 errors mean the app token does not match the runner token."
    }
  ];
}

export function buildRunnerSetupGuide(input: RunnerSetupGuideInput): RunnerSetupGuideStep[] {
  const platform = resolvePlatform(input.platform);
  const failureKind = classifyRunnerHealthFailure(input.probe, {
    httpStatus: input.httpStatus,
    appTokenConfigured: input.appTokenConfigured,
    runnerAgent: input.runnerAgent
  });

  if (failureKind === "unauthorized") {
    return buildTokenGuide();
  }

  if (failureKind === "ready" && !input.showAllCommands) {
    return [];
  }

  if (failureKind === "unreachable" || input.probe?.mode === undefined) {
    if (input.runnerAgent === "cursor") {
      return buildCursorGuide(input.probe, platform);
    }
    if (input.runnerAgent === "codex") {
      return buildCodexGuide(platform);
    }
    return buildMockGuide(platform);
  }

  if (failureKind === "misconfigured") {
    if (input.runnerAgent === "cursor" || input.probe?.mode === "cursor") {
      return buildCursorGuide(input.probe, platform);
    }
    if (input.runnerAgent === "codex" || input.probe?.mode === "codex") {
      return buildCodexGuide(platform);
    }
    return buildMockGuide(platform);
  }

  if (failureKind === "agentUnavailable") {
    if (input.runnerAgent === "cursor") {
      return buildCursorGuide(input.probe, platform);
    }
    return buildCodexGuide(platform);
  }

  if (input.showAllCommands) {
    if (input.runnerAgent === "cursor") {
      return buildCursorGuide(input.probe, platform);
    }
    if (input.runnerAgent === "codex") {
      return buildCodexGuide(platform);
    }
    return buildMockGuide(platform);
  }

  return [];
}

export function runnerSetupSummaryTitle(
  failureKind: FeatureSprintRunnerHealthFailureKind,
  runnerAgent: FeatureSprintRunnerAgent
): string {
  switch (failureKind) {
    case "unauthorized":
      return "Runner token mismatch";
    case "unreachable":
      return "Runner not reachable";
    case "misconfigured":
      return "Runner needs configuration";
    case "agentUnavailable":
      return `${runnerAgentLabel(runnerAgent)} not ready on runner`;
    case "ready":
      return "Runner ready";
    default:
      return "Runner setup";
  }
}

export function detectRunnerSetupPlatform(os: string | undefined): RunnerSetupPlatform {
  if (!os) {
    return "unknown";
  }
  if (os === "windows" || os === "win32") {
    return "windows";
  }
  if (os === "macos" || os === "ios" || os === "linux" || os === "android") {
    return "unix";
  }
  return "unknown";
}
