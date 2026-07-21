import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type ResolvedBin = {
  requested: string;
  resolved: string;
  exists: boolean;
  via: "explicit" | "path" | "localappdata" | "fallback";
};

function firstExisting(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function whereOnWindows(bin: string): string | undefined {
  const result = spawnSync("where.exe", [bin], {
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0 || !result.stdout) {
    return undefined;
  }
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  // Prefer .cmd over .ps1 for Node spawn reliability.
  const cmd = lines.find((line) => line.toLowerCase().endsWith(".cmd"));
  return cmd ?? lines[0];
}

function whichOnUnix(bin: string): string | undefined {
  const result = spawnSync("which", [bin], {
    encoding: "utf8",
    shell: false
  });
  if (result.status !== 0 || !result.stdout) {
    return undefined;
  }
  return result.stdout.trim().split(/\r?\n/)[0] || undefined;
}

/** Resolve a CLI binary for spawn, preferring Windows .cmd wrappers over .ps1. */
export function resolveAgentBin(
  requested: string,
  platform: NodeJS.Platform = process.platform
): ResolvedBin {
  const trimmed = requested.trim() || "agent";

  if (path.isAbsolute(trimmed) || /[\\/]/.test(trimmed)) {
    const resolved = path.resolve(trimmed);
    return {
      requested: trimmed,
      resolved,
      exists: existsSync(resolved),
      via: "explicit"
    };
  }

  if (platform === "win32") {
    const fromPath = whereOnWindows(trimmed);
    if (fromPath) {
      return { requested: trimmed, resolved: fromPath, exists: true, via: "path" };
    }

    const local = process.env.LOCALAPPDATA ?? "";
    const localCandidate = firstExisting([
      path.join(local, "cursor-agent", `${trimmed}.cmd`),
      path.join(local, "cursor-agent", "agent.cmd"),
      path.join(local, "cursor-agent", `${trimmed}.ps1`),
      path.join(local, "cursor-agent", "agent.ps1")
    ]);
    if (localCandidate) {
      return {
        requested: trimmed,
        resolved: localCandidate,
        exists: true,
        via: "localappdata"
      };
    }

    return { requested: trimmed, resolved: trimmed, exists: false, via: "fallback" };
  }

  const fromPath = whichOnUnix(trimmed);
  if (fromPath) {
    return { requested: trimmed, resolved: fromPath, exists: true, via: "path" };
  }

  return { requested: trimmed, resolved: trimmed, exists: false, via: "fallback" };
}

export function resolveCursorBin(
  platform: NodeJS.Platform = process.platform
): ResolvedBin {
  const configured = process.env.FEATURE_SPRINT_CURSOR_BIN?.trim() || "agent";
  return resolveAgentBin(configured, platform);
}

export function resolveCodexBin(
  platform: NodeJS.Platform = process.platform
): ResolvedBin {
  const configured = process.env.FEATURE_SPRINT_CODEX_BIN?.trim() || "codex";
  if (platform === "win32" && !path.isAbsolute(configured) && !/[\\/]/.test(configured)) {
    const npmCmd = path.join(process.env.APPDATA ?? "", "npm", "codex.cmd");
    if (existsSync(npmCmd)) {
      return {
        requested: configured,
        resolved: npmCmd,
        exists: true,
        via: "path"
      };
    }
  }
  return resolveAgentBin(configured, platform);
}
