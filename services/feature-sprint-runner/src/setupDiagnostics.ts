import { spawn } from "node:child_process";

import { resolveRunnerToken } from "./auth";
import {
  checkRealCodexGate,
  checkRealCursorGate,
  collectSetupMissingEnv,
  resolveRecommendedScript
} from "./providerGates";
import { buildAgentSpawn, resolveRunnerMode } from "./runPacket";
import type { RunnerMode } from "./providerGates";

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

function resolveCursorBin(): string {
  return process.env.FEATURE_SPRINT_CURSOR_BIN?.trim() || "agent";
}

export function probeCursorCli(
  bin: string = resolveCursorBin(),
  platform: NodeJS.Platform = process.platform,
  timeoutMs = 3000
): Promise<FeatureSprintRunnerCliProbe> {
  const spawnSpec = buildAgentSpawn(bin, ["--version"], platform);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: FeatureSprintRunnerCliProbe) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        detected: false,
        bin,
        error: "CLI version check timed out."
      });
    }, timeoutMs);

    const child = spawn(spawnSpec.file, spawnSpec.args, {
      shell: false,
      env: process.env
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const version = [stdout, stderr].filter(Boolean).join("\n").trim();
      if ((exitCode ?? 1) === 0 && version) {
        finish({ detected: true, bin, version: version.split("\n")[0]?.trim() || version });
        return;
      }

      finish({
        detected: false,
        bin,
        error: version || "Cursor CLI not found on PATH."
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        detected: false,
        bin,
        error: error instanceof Error ? error.message : "Failed to spawn Cursor CLI."
      });
    });
  });
}

export async function buildSetupDiagnostics(
  platform: NodeJS.Platform = process.platform
): Promise<FeatureSprintRunnerSetupDiagnostics> {
  const mode = resolveRunnerMode();
  const tokenConfigured = Boolean(resolveRunnerToken());
  const missingEnv = collectSetupMissingEnv(mode);

  const needsCli =
    mode === "cursor" ||
    mode === "real" ||
    !checkRealCursorGate().ok ||
    missingEnv.includes("CURSOR_API_KEY");

  const cli = needsCli ? await probeCursorCli(resolveCursorBin(), platform) : { detected: false };

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
