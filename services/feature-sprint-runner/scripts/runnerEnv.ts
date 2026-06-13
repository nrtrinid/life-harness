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
  if (!agentDir || process.env.PATH?.includes(agentDir)) {
    return;
  }

  process.env.PATH = `${process.env.PATH};${agentDir}`;
  if (!process.env.FEATURE_SPRINT_CURSOR_BIN) {
    process.env.FEATURE_SPRINT_CURSOR_BIN = path.join(agentDir, "agent.cmd");
  }
}
