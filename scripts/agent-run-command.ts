import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { changedFilePaths, packageScripts, REPO_ROOT, recommendedChecks, repoPath, taskAreaForPath, truncateList } from "./agent-utils";

export type AgentLogMeta = {
  command: string;
  durationMs: number;
  exitCode: number | null;
  kind: string;
  logPath: string;
  startedAt: string;
};

export type FailureSummary = {
  command: string;
  durationMs?: number;
  exitCode?: number | null;
  failureCount: number | null;
  firstFailure: string | null;
  likelyFile: string | null;
  logPath: string;
  narrowRerun: string | null;
  parserNote: string;
  passed: boolean | null;
};

const LOG_DIR = join(REPO_ROOT, "tmp", "agent-logs");

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sanitizeKind(kind: string): string {
  return kind.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

export function relativeLogPath(path: string): string {
  return repoPath(path.replace(`${REPO_ROOT}\\`, "").replace(`${REPO_ROOT}/`, ""));
}

function parseTs(text: string): Partial<FailureSummary> | null {
  const matches = Array.from(text.matchAll(/([A-Za-z0-9_./\\:-]+\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+([^\r\n]+)/g));
  if (matches.length === 0) return null;
  const first = matches[0];
  const file = repoPath(first[1]);
  return {
    failureCount: matches.length,
    firstFailure: `${file}:${first[2]}:${first[3]} ${first[4]} ${first[5]}`,
    likelyFile: file,
    narrowRerun: packageScripts().typecheck ? "npm run typecheck" : null,
    parserNote: "TypeScript summary parsed approximately."
  };
}

function parseVitest(text: string): Partial<FailureSummary> | null {
  const failedFile = /(?:FAIL|❯)\s+([^\r\n]+\.(?:test|spec)\.(?:ts|tsx|js|jsx))/u.exec(text);
  const failedTests = Array.from(text.matchAll(/×\s+([^\r\n]+)|✕\s+([^\r\n]+)|it\([^)]*\)\s*failed/gu));
  const assertion = /AssertionError:[^\r\n]+|expected[^\r\n]+received[^\r\n]+|Error:[^\r\n]+/i.exec(text);
  if (!failedFile && failedTests.length === 0 && !assertion) return null;
  const file = failedFile ? repoPath(failedFile[1].trim()) : null;
  const testName = failedTests[0] ? (failedTests[0][1] ?? failedTests[0][2] ?? failedTests[0][0]).trim() : null;
  return {
    failureCount: failedTests.length || (failedFile ? 1 : null),
    firstFailure: [file, testName, assertion?.[0]?.trim()].filter(Boolean).join(" | ") || null,
    likelyFile: file,
    narrowRerun: file ? `npm run test -- ${file}` : "npm run test -- <nearest test>",
    parserNote: "Vitest summary parsed approximately."
  };
}

function parsePytest(text: string): Partial<FailureSummary> | null {
  const failed = /FAILED\s+([^\s]+)(?:\s+-\s+([^\r\n]+))?/.exec(text);
  if (!failed) return null;
  const file = repoPath(failed[1].split("::")[0] ?? failed[1]);
  const count = /(\d+)\s+failed/.exec(text);
  return {
    failureCount: count ? Number(count[1]) : 1,
    firstFailure: failed[0].trim(),
    likelyFile: file,
    narrowRerun: file.startsWith("services/ai-gateway/")
      ? `cd services/ai-gateway; pytest ${file.replace("services/ai-gateway/", "")} -q`
      : `pytest ${file} -q`,
    parserNote: "Pytest summary parsed approximately."
  };
}

function parseGeneric(text: string): Partial<FailureSummary> {
  const lines = text.split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean);
  const first = lines.find((line) => /error|failed|fail|exception|assert/i.test(line)) ?? lines[0] ?? null;
  return {
    failureCount: first ? 1 : null,
    firstFailure: first,
    likelyFile: first ? repoPath(/([A-Za-z0-9_./\\:-]+\.(?:ts|tsx|js|jsx|py))/.exec(first)?.[1] ?? "") || null : null,
    narrowRerun: null,
    parserNote: "Unknown output format; generic summary only."
  };
}

export function summarizeRawLog(rawText: string, meta: AgentLogMeta): FailureSummary {
  const passed = meta.exitCode === 0;
  if (passed) {
    return {
      command: meta.command,
      durationMs: meta.durationMs,
      exitCode: meta.exitCode,
      failureCount: 0,
      firstFailure: null,
      likelyFile: null,
      logPath: meta.logPath,
      narrowRerun: null,
      parserNote: "Command passed; no failure parsing needed.",
      passed
    };
  }

  const parsed = parseTs(rawText) ?? parseVitest(rawText) ?? parsePytest(rawText) ?? parseGeneric(rawText);
  return {
    command: meta.command,
    durationMs: meta.durationMs,
    exitCode: meta.exitCode,
    failureCount: parsed.failureCount ?? null,
    firstFailure: parsed.firstFailure ?? null,
    likelyFile: parsed.likelyFile ?? null,
    logPath: meta.logPath,
    narrowRerun: parsed.narrowRerun ?? rerunForFile(parsed.likelyFile ?? null),
    parserNote: parsed.parserNote ?? "Summary parsed approximately.",
    passed
  };
}

function rerunForFile(file: string | null): string | null {
  if (!file) return null;
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) return `npm run test -- ${file}`;
  if (/\.py$/.test(file)) return `pytest ${file} -q`;
  return recommendedChecks([file])[0] ?? null;
}

export function runAgentCommand(kind: string, command: string, note?: string): FailureSummary {
  ensureLogDir();
  const startedAt = new Date();
  const base = `${stamp()}-${sanitizeKind(kind)}`;
  const logPathAbs = join(LOG_DIR, `${base}.log`);
  const metaPath = join(LOG_DIR, `${base}.json`);
  const started = Date.now();
  const result = spawnSync(command, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: true
  });
  const durationMs = Date.now() - started;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = typeof result.status === "number" ? result.status : result.error ? 1 : 0;
  const logPath = relativeLogPath(logPathAbs);
  const meta: AgentLogMeta = {
    command,
    durationMs,
    exitCode,
    kind,
    logPath,
    startedAt: startedAt.toISOString()
  };
  const rawLog = [
    `# Agent raw log`,
    `command: ${command}`,
    `kind: ${kind}`,
    `startedAt: ${meta.startedAt}`,
    `durationMs: ${durationMs}`,
    `exitCode: ${exitCode}`,
    note ? `note: ${note}` : null,
    "",
    "## stdout",
    stdout,
    "",
    "## stderr",
    stderr,
    result.error ? `\n## spawn error\n${result.error.message}` : null
  ].filter((part) => part !== null).join("\n");
  writeFileSync(logPathAbs, rawLog, "utf8");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
  return summarizeRawLog(rawLog, meta);
}

export function latestAgentLog(): { meta: AgentLogMeta; rawText: string } | null {
  if (!existsSync(LOG_DIR)) return null;
  const logs = readdirSync(LOG_DIR)
    .filter((file) => file.endsWith(".log"))
    .sort()
    .reverse();
  for (const log of logs) {
    const logAbs = join(LOG_DIR, log);
    const metaAbs = logAbs.replace(/\.log$/, ".json");
    if (!existsSync(metaAbs)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaAbs, "utf8")) as AgentLogMeta;
      return { meta, rawText: readFileSync(logAbs, "utf8") };
    } catch {
      continue;
    }
  }
  return null;
}

export function latestFailureSummary(): FailureSummary | null {
  const latest = latestAgentLog();
  return latest ? summarizeRawLog(latest.rawText, latest.meta) : null;
}

export function printSummary(summary: FailureSummary): void {
  const changed = changedFilePaths();
  const { shown, omitted } = truncateList(changed, 10);
  console.log(`# Agent Command Summary`);
  console.log(`Command: ${summary.command}`);
  console.log(`Result: ${summary.passed === true ? "PASS" : summary.passed === false ? "FAIL" : "UNKNOWN"}`);
  console.log(`Exit code: ${summary.exitCode ?? "unknown"}`);
  console.log(`Duration: ${summary.durationMs ?? 0}ms`);
  console.log(`Raw log: ${summary.logPath}`);
  console.log(`Detected failures/errors: ${summary.failureCount ?? "unknown"}`);
  console.log(`First relevant failure: ${summary.firstFailure ?? "(none detected)"}`);
  console.log(`Likely file/test: ${summary.likelyFile ?? "(unknown)"}`);
  console.log(`Suggested narrow rerun: ${summary.narrowRerun ?? "(none)"}`);
  console.log(`Parser note: ${summary.parserNote}`);
  console.log(`Likely touched files:`);
  if (shown.length === 0) {
    console.log(`- (none)`);
  } else {
    for (const file of shown) {
      console.log(`- ${file} (${taskAreaForPath(file)})`);
    }
  }
  if (omitted > 0) console.log(`- ... ${omitted} more`);
}

export function commandOrExit(scriptName: string): string {
  const scripts = packageScripts();
  if (!scripts[scriptName]) {
    console.error(`Missing package script: ${scriptName}`);
    process.exit(1);
  }
  return `npm run ${scriptName}`;
}

export function compactFileList(files: string[], limit = 30): string[] {
  const { shown, omitted } = truncateList(files, limit);
  return omitted > 0 ? [...shown, `... ${omitted} more`] : shown;
}

export function basenameForDisplay(file: string): string {
  return basename(file);
}
