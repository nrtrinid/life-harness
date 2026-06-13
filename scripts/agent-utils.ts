import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export type PackageScripts = Record<string, string>;

export type TaskBlock = {
  name: string;
  body: string;
};

export function repoPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function absolute(path: string): string {
  return resolve(REPO_ROOT, path);
}

export function relativeToRepo(path: string): string {
  return repoPath(relative(REPO_ROOT, path));
}

export function readText(path: string): string | null {
  try {
    return readFileSync(absolute(path), "utf8");
  } catch {
    return null;
  }
}

export function readLines(path: string): string[] {
  return (readText(path) ?? "").split(/\r\n|\n|\r/);
}

export function lineCount(path: string): number {
  const lines = readLines(path);
  return lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

export function runGit(args: string[], trim = true): string | null {
  try {
    const output = execSync(`git ${args.join(" ")}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return trim ? output.trim() : output.replace(/[\r\n]+$/, "");
  } catch {
    return null;
  }
}

export function currentBranch(): string {
  return runGit(["branch", "--show-current"]) || "(unknown)";
}

export function gitStatusLines(): string[] {
  const status = runGit(["status", "--short"], false);
  return status ? status.split(/\r\n|\n|\r/).filter(Boolean) : [];
}

export function statusPath(line: string): string {
  const trimmed = line.slice(3).trim().replace(/^"|"$/g, "");
  const renameParts = trimmed.split(" -> ");
  return repoPath(renameParts[renameParts.length - 1] ?? trimmed);
}

export function changedFilePaths(): string[] {
  return gitStatusLines().map(statusPath);
}

export function packageScripts(): PackageScripts {
  try {
    const pkg = JSON.parse(readFileSync(absolute("package.json"), "utf8")) as {
      scripts?: PackageScripts;
    };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

export function commandIfExists(scriptName: string): string | null {
  return packageScripts()[scriptName] ? `npm run ${scriptName}` : null;
}

export function readAgentIgnore(): string[] {
  const text = readText(".agentignore");
  if (!text) {
    return [];
  }
  return text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

export function isIgnored(path: string, ignoreEntries = readAgentIgnore()): boolean {
  const normalized = repoPath(path).replace(/^\.\//, "");
  for (const raw of ignoreEntries) {
    const pattern = repoPath(raw).replace(/^\.\//, "");
    if (pattern.endsWith("/")) {
      const dir = pattern.slice(0, -1);
      if (normalized === dir || normalized.startsWith(`${dir}/`)) {
        return true;
      }
      continue;
    }
    if (pattern.includes("*")) {
      if (globToRegex(pattern).test(normalized) || globToRegex(`**/${pattern}`).test(normalized)) {
        return true;
      }
      continue;
    }
    if (normalized === pattern || normalized.endsWith(`/${pattern}`)) {
      return true;
    }
  }
  return false;
}

export function isTextFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  if (!ext) {
    return basename(path).startsWith(".");
  }
  return new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
    ".txt",
    ".py",
    ".css",
    ".html",
    ".yml",
    ".yaml"
  ]).has(ext);
}

export function walkTextFiles(root = ".", options: { maxBytes?: number } = {}): string[] {
  const ignoreEntries = readAgentIgnore();
  const start = absolute(root);
  if (!existsSync(start)) {
    return [];
  }
  const maxBytes = options.maxBytes ?? 250_000;
  const results: string[] = [];
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const rel = relativeToRepo(current);
    if (rel && rel !== "." && isIgnored(rel, ignoreEntries)) {
      continue;
    }
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      const entryRel = relativeToRepo(full);
      if (isIgnored(entryRel, ignoreEntries)) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && isTextFile(entryRel)) {
        try {
          if (statSync(full).size <= maxBytes) {
            results.push(entryRel);
          }
        } catch {
          // Ignore unreadable files.
        }
      }
    }
  }
  return results.sort();
}

export function parseArgs(argv: string[]): { flags: Map<string, string | boolean>; positionals: string[] } {
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        flags.set(key, next);
        index += 1;
      } else {
        flags.set(key, true);
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

export function numberFlag(flags: Map<string, string | boolean>, key: string, fallback: number): number {
  const value = flags.get(key);
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseTaskBlocks(): TaskBlock[] {
  const text = readText("docs/AGENT_CONTEXT_MAP.md");
  if (!text) {
    return [];
  }
  const lines = text.split(/\r\n|\n|\r/);
  const blocks: TaskBlock[] = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];
  for (const line of lines) {
    const match = /^## Task:\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (currentName) {
        blocks.push({ name: currentName, body: currentLines.join("\n").trim() });
      }
      currentName = match[1];
      currentLines = [line];
    } else if (currentName) {
      currentLines.push(line);
    }
  }
  if (currentName) {
    blocks.push({ name: currentName, body: currentLines.join("\n").trim() });
  }
  return blocks;
}

export function findTaskBlock(name: string): TaskBlock | null {
  return parseTaskBlocks().find((block) => block.name === name) ?? null;
}

let cachedTestFiles: string[] | null = null;

function allTestFiles(): string[] {
  if (!cachedTestFiles) {
    cachedTestFiles = walkTextFiles(".", { maxBytes: 200_000 }).filter((file) =>
      /\.(test|spec)\.(ts|tsx|js|jsx|py)$/.test(file) || /(^|\/)test_.*\.py$/.test(file)
    );
  }
  return cachedTestFiles;
}

export function likelyTestsFor(sourcePath: string): { existing: string[]; possible: string[] } {
  const normalized = repoPath(sourcePath);
  const ext = extname(normalized);
  if (![".ts", ".tsx", ".js", ".jsx", ".py"].includes(ext)) {
    return { existing: [], possible: [] };
  }
  if (/\.(test|spec)\.(ts|tsx|js|jsx|py)$/.test(normalized) || /(^|\/)test_.*\.py$/.test(normalized)) {
    return { existing: [normalized], possible: [] };
  }
  const stem = normalized.slice(0, -ext.length);
  const sourceBase = basename(stem);
  if (!sourceBase) {
    return { existing: [], possible: [] };
  }
  const possible = [
    `${stem}.test${ext}`,
    `${stem}.spec${ext}`,
    `${dirname(normalized)}/__tests__/${sourceBase}.test${ext}`,
    `${dirname(normalized)}/__tests__/${sourceBase}.spec${ext}`
  ].map(repoPath);

  if (normalized.startsWith("services/ai-gateway/app/")) {
    const base = basename(stem).replace(/[^a-zA-Z0-9_]/g, "_");
    possible.push(`services/ai-gateway/tests/test_${base}.py`);
  }
  if (normalized.startsWith("services/job-scout-runner/")) {
    possible.push("services/job-scout-runner/tests/runner.test.ts");
  }

  const baseName = sourceBase.toLowerCase();
  for (const test of allTestFiles()) {
    const lower = test.toLowerCase();
    if (lower.includes(`${baseName}.test`) || lower.includes(`${baseName}.spec`)) {
      possible.push(test);
    }
  }

  const unique = Array.from(new Set(possible));
  return {
    existing: unique.filter((file) => existsSync(absolute(file))),
    possible: unique.filter((file) => !existsSync(absolute(file)))
  };
}

export function taskAreaForPath(path: string): string {
  const p = repoPath(path);
  if (p.startsWith("services/ai-gateway/")) return "ai-gateway";
  if (p.includes("rawLab") || p.includes("raw-lab") || p.includes("components/rawLab")) return "raw-lab-containment";
  if (p.includes("askHarness") || p.includes("ask-harness") || p.includes("chatHarness") || p.includes("harnessContext")) return "ask-harness";
  if (p.includes("jobScout") || p.includes("jobSource") || p.includes("career") || p.startsWith("services/job-scout-runner/")) return "career-job-scout";
  if (p.startsWith("docs/") || p === "AGENTS.md" || p.startsWith("prompts/") || p.startsWith("tickets/")) return "docs-planning";
  if (p.startsWith("src/network/") || p.includes("Client.ts")) return "rtk-query-network-layer";
  if (p.startsWith("src/core/") || p.startsWith("src/state/") || p.startsWith("src/data/")) return "core-board-product-logic";
  return "unknown/mixed";
}

export function recommendedChecks(files: string[]): string[] {
  const scripts = packageScripts();
  const areas = new Set(files.map(taskAreaForPath));
  const checks: string[] = [];
  if (scripts["check:agent-budget"] && files.some((file) => file.includes("AGENT") || file.startsWith("docs/"))) {
    checks.push("npm run check:agent-budget");
  }
  if (scripts.typecheck && files.some((file) => /\.(ts|tsx)$/.test(file))) {
    checks.push("npm run typecheck");
  }
  if (scripts.test && files.some((file) => file.startsWith("src/") || file.startsWith("app/"))) {
    checks.push("npm run test -- <nearest test>");
  }
  if (scripts["scout:runner:test"] && areas.has("career-job-scout")) {
    checks.push("npm run scout:runner:test");
  }
  if (scripts["feature-runner:test"] && files.some((file) => file.startsWith("services/feature-sprint-runner/"))) {
    checks.push("npm run feature-runner:test");
  }
  if (checks.length === 0) {
    checks.push("git diff -- <touched files>");
    checks.push("git status --short");
  }
  return Array.from(new Set(checks));
}

export function truncateList<T>(items: T[], limit: number): { shown: T[]; omitted: number } {
  return { shown: items.slice(0, limit), omitted: Math.max(0, items.length - limit) };
}
