import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type Finding = {
  path: string;
  message: string;
};

type CheckedFile = {
  path: string;
  lines?: number;
  kb?: number;
};

const failures: Finding[] = [];
const warnings: Finding[] = [];
const checked: CheckedFile[] = [];

function repoPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function absolute(path: string): string {
  return resolve(REPO_ROOT, path);
}

function relativeToRepo(path: string): string {
  return repoPath(relative(REPO_ROOT, path));
}

function readLines(path: string): string[] {
  return readFileSync(path, "utf8").split(/\r\n|\n|\r/);
}

function lineCount(path: string): number {
  const lines = readLines(path);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    return lines.length - 1;
  }
  return lines.length;
}

function recordChecked(path: string, lines?: number): void {
  const stats = statSync(path);
  checked.push({
    path: relativeToRepo(path),
    lines,
    kb: Math.round((stats.size / 1024) * 10) / 10
  });
}

function fail(path: string, message: string): void {
  failures.push({ path: repoPath(path), message });
}

function warn(path: string, message: string): void {
  warnings.push({ path: repoPath(path), message });
}

function checkLineBudget(path: string, maxLines: number, label: string): void {
  const fullPath = absolute(path);
  if (!existsSync(fullPath)) {
    warn(path, `${label} is missing.`);
    return;
  }

  const lines = lineCount(fullPath);
  recordChecked(fullPath, lines);
  if (lines > maxLines) {
    fail(path, `${label} has ${lines} lines; budget is <= ${maxLines}.`);
  }
}

function walkFiles(root: string, predicate: (path: string) => boolean): string[] {
  const fullRoot = absolute(root);
  if (!existsSync(fullRoot)) {
    return [];
  }

  const results: string[] = [];
  const stack = [fullRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && predicate(entryPath)) {
        results.push(entryPath);
      }
    }
  }
  return results.sort();
}

function checkSkillBudgets(): void {
  const skillFiles = walkFiles(".agents/skills", (path) => path.endsWith("SKILL.md"));
  for (const file of skillFiles) {
    const lines = lineCount(file);
    recordChecked(file, lines);
    if (lines > 120) {
      fail(relativeToRepo(file), `Skill has ${lines} lines; budget is <= 120.`);
    }
  }
}

function warnLargePlanningDocs(): void {
  const candidates = [
    ...walkFiles("docs/plans", (path) => path.endsWith(".md")),
    absolute("docs/meta/Life_Harness_Compiled_Context.md"),
    absolute("docs/ux/current_ux_audit.md")
  ];

  const seen = new Set<string>();
  for (const file of candidates) {
    if (!existsSync(file) || seen.has(file)) {
      continue;
    }
    seen.add(file);
    const stats = statSync(file);
    const kb = stats.size / 1024;
    if (kb > 15) {
      warn(relativeToRepo(file), `Large planning/archive doc (${kb.toFixed(1)} KB); do not default-read.`);
    }
  }
}

function main(): void {
  if (!existsSync(absolute(".agentignore"))) {
    fail(".agentignore", "Missing required .agentignore.");
  } else {
    recordChecked(absolute(".agentignore"), lineCount(absolute(".agentignore")));
  }

  if (existsSync(absolute("AGENTS.md"))) {
    checkLineBudget("AGENTS.md", 150, "Root AGENTS.md");
  } else {
    warn("AGENTS.md", "Root AGENTS.md is missing.");
  }

  checkSkillBudgets();

  if (existsSync(absolute("docs/AGENT_CONTEXT_MAP.md"))) {
    checkLineBudget("docs/AGENT_CONTEXT_MAP.md", 400, "Agent context map");
  } else {
    warn("docs/AGENT_CONTEXT_MAP.md", "Missing required agent context map.");
  }

  warnLargePlanningDocs();

  const status = failures.length === 0 ? "PASS" : "FAIL";
  console.log(`Agent budget check: ${status}`);
  console.log(`Files checked: ${checked.length}`);
  for (const file of checked) {
    const parts = [`- ${file.path}`];
    if (typeof file.lines === "number") {
      parts.push(`${file.lines} lines`);
    }
    if (typeof file.kb === "number") {
      parts.push(`${file.kb} KB`);
    }
    console.log(parts.join(" | "));
  }

  if (warnings.length > 0) {
    console.log("");
    console.log(`Warnings (${warnings.length}):`);
    for (const item of warnings) {
      console.log(`- ${item.path}: ${item.message}`);
    }
  }

  if (failures.length > 0) {
    console.log("");
    console.log(`Failures (${failures.length}):`);
    for (const item of failures) {
      console.log(`- ${item.path}: ${item.message}`);
    }
    process.exitCode = 1;
  }
}

main();
