import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

export function runnerScriptsRoot(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

export function repoRootFromScripts(): string {
  return path.resolve(runnerScriptsRoot(), "../../..");
}

export function loadRunnerEnvLocal(repoRoot = repoRootFromScripts()) {
  loadEnvFile(path.join(repoRoot, "services/feature-sprint-runner/.env.local"));
}

export function ensureCursorAgentOnPath() {
  if (process.platform !== "win32") {
    return;
  }

  const agentDir = path.join(process.env.LOCALAPPDATA ?? "", "cursor-agent");
  if (!agentDir) {
    return;
  }

  if (!process.env.PATH?.includes(agentDir)) {
    process.env.PATH = `${process.env.PATH};${agentDir}`;
  }

  if (!process.env.FEATURE_SPRINT_CURSOR_BIN) {
    const cmdPath = path.join(agentDir, "agent.cmd");
    const ps1Path = path.join(agentDir, "agent.ps1");
    // Prefer .cmd — Node can spawn it via ComSpec without PowerShell.
    if (existsSync(cmdPath)) {
      process.env.FEATURE_SPRINT_CURSOR_BIN = cmdPath;
    } else if (existsSync(ps1Path)) {
      process.env.FEATURE_SPRINT_CURSOR_BIN = ps1Path;
    }
  }
}
