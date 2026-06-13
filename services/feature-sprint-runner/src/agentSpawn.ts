import path from "node:path";

const WINDOWS_SCRIPT_EXTENSIONS = new Set([".cmd", ".bat", ".ps1"]);

export function needsWindowsAgentSpawnShim(
  bin: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (platform !== "win32") {
    return false;
  }

  return WINDOWS_SCRIPT_EXTENSIONS.has(path.extname(bin).toLowerCase());
}

export type AgentSpawnSpec = {
  file: string;
  args: string[];
};

export function buildAgentSpawnSpec(
  bin: string,
  args: string[],
  platform: NodeJS.Platform = process.platform
): AgentSpawnSpec {
  if (needsWindowsAgentSpawnShim(bin, platform)) {
    return {
      file: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", bin, ...args]
    };
  }

  return { file: bin, args };
}
