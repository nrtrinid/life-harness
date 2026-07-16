import { createConnection } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";

import { FEATURE_SPRINT_RUNNER_DEFAULT_PORT } from "../../../src/core/featureSprintRunner";
import { resolveRunnerToken } from "./auth";
import {
  checkRealCodexGate,
  checkRealCursorGate,
  collectSetupMissingEnv,
  resolveRecommendedScript,
  resolveRunnerMode,
  type RunnerMode
} from "./providerGates";
import { resolveCodexBin, resolveCursorBin } from "./resolveBin";
import { secretConfigured } from "./redact";
import { spawnAgentProcess } from "./spawnAgent";
import { resolveWorktreeRoot } from "./worktree";

export type FeatureSprintRunnerCliProbe = {
  detected: boolean;
  bin?: string;
  version?: string;
  error?: string;
};

export type FeatureSprintRunnerSetupDiagnostics = {
  serverTokenRequired: boolean;
  serverTokenConfigured: boolean;
  missingEnv: string[];
  cli: FeatureSprintRunnerCliProbe;
  platform: NodeJS.Platform;
  recommendedScript: RunnerMode;
};

export type SetupCheckSeverity = "ok" | "warning" | "blocker";

export type SetupCheckItem = {
  id: string;
  status: SetupCheckSeverity;
  label: string;
  detail: string;
  remediation?: string;
};

export type FeatureSprintSetupCheckReport = {
  ok: boolean;
  mode: RunnerMode;
  canRunMock: boolean;
  canRunRealCursor: boolean;
  canRunRealCodex: boolean;
  blockers: string[];
  warnings: string[];
  items: SetupCheckItem[];
  /** Backward-compatible health setup snapshot fields. */
  setup: FeatureSprintRunnerSetupDiagnostics;
  node: { version: string; major: number; compatible: boolean };
  host: string;
  port: number;
  portStatus: "free" | "in_use" | "runner_responding" | "unknown";
};

function resolvePort(): number {
  const raw = process.env.FEATURE_SPRINT_RUNNER_PORT?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : FEATURE_SPRINT_RUNNER_DEFAULT_PORT;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FEATURE_SPRINT_RUNNER_DEFAULT_PORT;
}

function parseNodeMajor(version: string): number {
  const match = /^v?(\d+)/.exec(version);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

export async function probePort(
  host: string,
  port: number,
  timeoutMs = 750
): Promise<"free" | "in_use" | "unknown"> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (status: "free" | "in_use" | "unknown") => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(status);
    };
    const timer = setTimeout(() => finish("unknown"), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      finish("in_use");
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === "ECONNREFUSED") {
        finish("free");
        return;
      }
      finish("unknown");
    });
  });
}

export async function probeCliVersion(
  bin: string,
  platform: NodeJS.Platform = process.platform,
  timeoutMs = 12_000
): Promise<FeatureSprintRunnerCliProbe> {
  if (!bin) {
    return { detected: false, error: "No binary configured." };
  }

  const result = await spawnAgentProcess({
    bin,
    args: ["--version"],
    cwd: process.cwd(),
    timeoutMs,
    maxStdoutChars: 4_000,
    maxStderrChars: 4_000
  });

  const version = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.termination === "timeout") {
    return { detected: false, bin, error: "CLI version check timed out." };
  }
  if (result.termination === "spawn_error") {
    return {
      detected: false,
      bin,
      error: version || "Failed to spawn CLI."
    };
  }
  if ((result.exitCode ?? 1) === 0 && version) {
    return {
      detected: true,
      bin,
      version: version.split(/\r?\n/)[0]?.trim() || version
    };
  }

  return {
    detected: false,
    bin,
    error: version || "CLI not found or returned non-zero."
  };
}

/** @deprecated Prefer probeCliVersion + resolveCursorBin; kept for existing tests. */
export function probeCursorCli(
  bin: string = process.env.FEATURE_SPRINT_CURSOR_BIN?.trim() || "agent",
  platform: NodeJS.Platform = process.platform,
  timeoutMs = 12_000
): Promise<FeatureSprintRunnerCliProbe> {
  return probeCliVersion(bin, platform, timeoutMs);
}

export async function buildSetupDiagnostics(
  platform: NodeJS.Platform = process.platform,
  options?: { probeCli?: boolean; cliTimeoutMs?: number }
): Promise<FeatureSprintRunnerSetupDiagnostics> {
  const mode = resolveRunnerMode();
  const tokenConfigured = Boolean(resolveRunnerToken());
  const missingEnv = collectSetupMissingEnv(mode);
  const shouldProbeCli = options?.probeCli !== false;

  const needsCursorCli =
    mode === "cursor" ||
    mode === "real" ||
    missingEnv.includes("CURSOR_API_KEY") ||
    missingEnv.includes("FEATURE_SPRINT_RUNNER_ENABLE_CURSOR");

  let cli: FeatureSprintRunnerCliProbe = { detected: false };
  if (shouldProbeCli && needsCursorCli) {
    const resolved = resolveCursorBin(platform);
    cli = await probeCliVersion(resolved.resolved, platform, options?.cliTimeoutMs ?? 12_000);
    if (!cli.detected && !resolved.exists) {
      cli = {
        detected: false,
        bin: resolved.requested,
        error: `Cursor CLI not found (looked for ${resolved.resolved}).`
      };
    }
  } else if (needsCursorCli) {
    const resolved = resolveCursorBin(platform);
    cli = {
      detected: resolved.exists,
      bin: resolved.resolved,
      error: resolved.exists
        ? undefined
        : `Cursor CLI not probed (looked for ${resolved.resolved}).`
    };
  }

  return {
    serverTokenRequired: tokenConfigured,
    serverTokenConfigured: tokenConfigured,
    missingEnv,
    cli,
    platform,
    recommendedScript: resolveRecommendedScript(mode)
  };
}

export function summarizeSetupForHealth(mode: RunnerMode): {
  codexGate: ReturnType<typeof checkRealCodexGate>;
  cursorGate: ReturnType<typeof checkRealCursorGate>;
} {
  return {
    codexGate: checkRealCodexGate(),
    cursorGate: checkRealCursorGate()
  };
}

function pushItem(
  items: SetupCheckItem[],
  item: SetupCheckItem,
  blockers: string[],
  warnings: string[]
) {
  items.push(item);
  if (item.status === "blocker") {
    blockers.push(`${item.label}: ${item.detail}`);
  } else if (item.status === "warning") {
    warnings.push(`${item.label}: ${item.detail}`);
  }
}

/**
 * Full local setup report (does not require the runner process to be running).
 * Secrets are never printed — only configured/missing booleans and redacted details.
 */
export async function buildSetupCheckReport(
  platform: NodeJS.Platform = process.platform
): Promise<FeatureSprintSetupCheckReport> {
  const mode = resolveRunnerMode();
  const host = "127.0.0.1";
  const port = resolvePort();
  const items: SetupCheckItem[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const nodeVersion = process.version;
  const nodeMajor = parseNodeMajor(nodeVersion);
  const nodeCompatible = nodeMajor >= 18;
  pushItem(
    items,
    {
      id: "node",
      status: nodeCompatible ? "ok" : "blocker",
      label: "Node.js runtime",
      detail: `Detected ${nodeVersion} (major ${nodeMajor}).`,
      remediation: nodeCompatible
        ? undefined
        : "Install Node.js 18+ from https://nodejs.org and reopen the terminal."
    },
    blockers,
    warnings
  );

  pushItem(
    items,
    {
      id: "host_port",
      status: "ok",
      label: "Runner bind address",
      detail: `Expected http://${host}:${port} (FEATURE_SPRINT_RUNNER_PORT).`
    },
    blockers,
    warnings
  );

  const portProbe = await probePort(host, port);
  let portStatus: FeatureSprintSetupCheckReport["portStatus"] = portProbe;
  if (portProbe === "in_use") {
    pushItem(
      items,
      {
        id: "port",
        status: "warning",
        label: `Port ${port}`,
        detail: `Something is listening on ${host}:${port}. Confirm it is the Feature Sprint runner.`,
        remediation: `curl http://${host}:${port}/health  or  npm run feature-runner:setup-check`
      },
      blockers,
      warnings
    );
  } else if (portProbe === "free") {
    pushItem(
      items,
      {
        id: "port",
        status: mode === "mock" ? "warning" : "warning",
        label: `Port ${port}`,
        detail: `Port ${port} is free — runner is not running yet.`,
        remediation:
          mode === "cursor"
            ? "npm run feature-runner:cursor"
            : mode === "codex" || mode === "real"
              ? "npm run feature-runner:real   # or set env then npm run feature-runner"
              : "npm run feature-runner:mock"
      },
      blockers,
      warnings
    );
  } else {
    pushItem(
      items,
      {
        id: "port",
        status: "warning",
        label: `Port ${port}`,
        detail: "Could not determine whether the port is free."
      },
      blockers,
      warnings
    );
  }

  pushItem(
    items,
    {
      id: "mode",
      status: "ok",
      label: "FEATURE_SPRINT_RUNNER_MODE",
      detail: `Resolved mode: ${mode}.`
    },
    blockers,
    warnings
  );

  const tokenConfigured = Boolean(resolveRunnerToken());
  const appTokenConfigured = secretConfigured("EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN");
  if (mode === "mock") {
    pushItem(
      items,
      {
        id: "token",
        status: tokenConfigured ? "ok" : "warning",
        label: "FEATURE_SPRINT_RUNNER_TOKEN",
        detail: tokenConfigured
          ? "Configured (value not shown)."
          : "Unset — runner accepts unauthenticated local requests.",
        remediation: tokenConfigured
          ? undefined
          : "Optional: set FEATURE_SPRINT_RUNNER_TOKEN in services/feature-sprint-runner/.env.local (do not print or commit the value)."
      },
      blockers,
      warnings
    );
  } else {
    pushItem(
      items,
      {
        id: "token",
        status: tokenConfigured ? "ok" : "blocker",
        label: "FEATURE_SPRINT_RUNNER_TOKEN",
        detail: tokenConfigured ? "Configured (value not shown)." : "Missing — required for real modes.",
        remediation:
          "Set FEATURE_SPRINT_RUNNER_TOKEN in services/feature-sprint-runner/.env.local (do not commit secrets)."
      },
      blockers,
      warnings
    );
  }

  if (tokenConfigured && !appTokenConfigured) {
    pushItem(
      items,
      {
        id: "app_token",
        status: "warning",
        label: "EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN",
        detail: "App token unset — Expo client will get 401 if the runner requires auth.",
        remediation:
          "Set EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN in repo-root .env to the same value as FEATURE_SPRINT_RUNNER_TOKEN, then restart Expo."
      },
      blockers,
      warnings
    );
  } else if (tokenConfigured && appTokenConfigured) {
    pushItem(
      items,
      {
        id: "app_token",
        status: "ok",
        label: "App token pairing",
        detail: "EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN is set (value not compared/printed)."
      },
      blockers,
      warnings
    );
  }

  const enableCursor = process.env.FEATURE_SPRINT_RUNNER_ENABLE_CURSOR === "1";
  const enableCodex = process.env.FEATURE_SPRINT_RUNNER_ENABLE_CODEX === "1";
  const enableImpl = process.env.FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION === "1";

  if (mode === "cursor" || mode === "real") {
    pushItem(
      items,
      {
        id: "enable_cursor",
        status: enableCursor ? "ok" : "blocker",
        label: "FEATURE_SPRINT_RUNNER_ENABLE_CURSOR",
        detail: enableCursor ? "Enabled (=1)." : "Not enabled — real Cursor profiles will be rejected.",
        remediation: "$env:FEATURE_SPRINT_RUNNER_ENABLE_CURSOR = '1'"
      },
      blockers,
      warnings
    );
  }

  if (mode === "codex" || mode === "real") {
    pushItem(
      items,
      {
        id: "enable_codex",
        status: enableCodex ? "ok" : "blocker",
        label: "FEATURE_SPRINT_RUNNER_ENABLE_CODEX",
        detail: enableCodex ? "Enabled (=1)." : "Not enabled — real Codex profiles will be rejected.",
        remediation: "$env:FEATURE_SPRINT_RUNNER_ENABLE_CODEX = '1'"
      },
      blockers,
      warnings
    );
  }

  if (mode !== "mock") {
    pushItem(
      items,
      {
        id: "enable_implementation",
        status: enableImpl ? "ok" : "warning",
        label: "FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION",
        detail: enableImpl
          ? "Enabled (=1)."
          : "Not enabled — scoping/review may work; implementation profiles will be rejected.",
        remediation: "$env:FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION = '1'"
      },
      blockers,
      warnings
    );
  }

  const cursorBin = resolveCursorBin(platform);
  const cursorProbe =
    mode === "cursor" || mode === "real" || enableCursor
      ? await probeCliVersion(cursorBin.resolved, platform)
      : { detected: false as const, bin: cursorBin.resolved };

  if (mode === "cursor" || mode === "real") {
    pushItem(
      items,
      {
        id: "cursor_cli",
        status: cursorProbe.detected ? "ok" : "blocker",
        label: "Cursor CLI",
        detail: cursorProbe.detected
          ? `Detected ${cursorProbe.bin} (${cursorProbe.version}).`
          : cursorProbe.error || `Not found (${cursorBin.resolved}).`,
        remediation: platform === "win32"
          ? "irm 'https://cursor.com/install?win32=true' | iex   then verify: agent --version"
          : "curl https://cursor.com/install -fsS | bash   then verify: agent --version"
      },
      blockers,
      warnings
    );

    const cursorKey = secretConfigured("CURSOR_API_KEY");
    pushItem(
      items,
      {
        id: "cursor_api_key",
        status: cursorKey ? "ok" : "blocker",
        label: "CURSOR_API_KEY",
        detail: cursorKey ? "Configured (value not shown)." : "Missing — required for real Cursor runs.",
        remediation:
          "Copy services/feature-sprint-runner/.env.local.example → .env.local and set CURSOR_API_KEY (User API key)."
      },
      blockers,
      warnings
    );
  }

  const codexBin = resolveCodexBin(platform);
  const codexProbe =
    mode === "codex" || mode === "real" || enableCodex
      ? await probeCliVersion(codexBin.resolved, platform)
      : { detected: false as const, bin: codexBin.resolved };

  if (mode === "codex" || mode === "real") {
    pushItem(
      items,
      {
        id: "codex_cli",
        status: codexProbe.detected ? "ok" : "blocker",
        label: "Codex CLI",
        detail: codexProbe.detected
          ? `Detected ${codexProbe.bin} (${codexProbe.version}).`
          : codexProbe.error || `Not found (${codexBin.resolved}).`,
        remediation:
          platform === "win32"
            ? "npm install -g @openai/codex   then verify: codex --version   (or set FEATURE_SPRINT_CODEX_BIN to the full path of codex.cmd)"
            : "npm install -g @openai/codex   then verify: codex --version"
      },
      blockers,
      warnings
    );
  }

  const repoRootGuess = path.resolve(process.cwd());
  pushItem(
    items,
    {
      id: "repo_root",
      status: existsSync(path.join(repoRootGuess, "package.json")) ? "ok" : "warning",
      label: "Repository root",
      detail: `cwd=${repoRootGuess}`,
      remediation: "Run setup-check from the life-harness repo root."
    },
    blockers,
    warnings
  );

  const worktreeRoot = resolveWorktreeRoot();
  pushItem(
    items,
    {
      id: "worktree_root",
      status: "ok",
      label: "FEATURE_SPRINT_WORKTREE_ROOT",
      detail: `Worktrees will be created under ${worktreeRoot}.`
    },
    blockers,
    warnings
  );

  if (platform === "win32") {
    const comSpec = process.env.ComSpec ?? "cmd.exe";
    pushItem(
      items,
      {
        id: "windows_shell",
        status: existsSync(comSpec) || comSpec === "cmd.exe" ? "ok" : "blocker",
        label: "Windows shell (ComSpec)",
        detail: `ComSpec=${comSpec}`,
        remediation: "Ensure cmd.exe is available; agent .cmd wrappers spawn via ComSpec."
      },
      blockers,
      warnings
    );
  }

  const setup = await buildSetupDiagnostics(platform);
  // Prefer richer cursor probe when available.
  if (cursorProbe.detected || cursorProbe.error) {
    setup.cli = {
      detected: cursorProbe.detected,
      bin: cursorProbe.bin ?? cursorBin.resolved,
      version: cursorProbe.version,
      error: cursorProbe.error
    };
  }

  const canRunMock = nodeCompatible;
  const canRunRealCursor =
    nodeCompatible &&
    (mode === "cursor" || mode === "real") &&
    enableCursor &&
    tokenConfigured &&
    secretConfigured("CURSOR_API_KEY") &&
    cursorProbe.detected === true;
  const canRunRealCodex =
    nodeCompatible &&
    (mode === "codex" || mode === "real") &&
    enableCodex &&
    tokenConfigured &&
    codexProbe.detected === true;

  let ok = canRunMock;
  if (mode === "cursor") {
    ok = canRunRealCursor;
  } else if (mode === "codex") {
    ok = canRunRealCodex;
  } else if (mode === "real") {
    ok = canRunRealCursor || canRunRealCodex;
  }

  // Port free is a warning, not a blocker for "can execute" — user still needs to start runner.
  // But ticket: "Exit nonzero when real execution cannot work" — env/CLI blockers matter.
  // If mode is mock and node ok, exit 0 even if port free.

  return {
    ok,
    mode,
    canRunMock,
    canRunRealCursor,
    canRunRealCodex,
    blockers,
    warnings,
    items,
    setup,
    node: { version: nodeVersion, major: nodeMajor, compatible: nodeCompatible },
    host,
    port,
    portStatus
  };
}
