import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  changedFilePaths,
  collectLikelyTestsForFiles,
  likelyTestsFor,
  packageScripts,
  REPO_ROOT,
  repoPath,
  taskAreaForPath
} from "./agent-utils";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_FROM_SCRIPT = resolve(SCRIPT_DIR, "..");

const PREFLIGHT_LINE_BUDGET = 200;

const PORTABLE_SCRIPTS = [
  "agent:preflight",
  "check:agent-budget",
  "check:boundaries",
  "agent:tests-for",
  "agent:auto-check"
] as const;

const DOC_SCAN_PATHS = [
  "AGENTS.md",
  "docs/AGENT_CONTEXT_MAP.md",
  "docs/README.md",
  "docs/AGENT_BUDGETS.md",
  "docs/STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md",
  "prompts/agent_task_prompt_template.md",
  ".cursor/rules/project-root.mdc"
] as const;

const NPM_RUN_PATTERN = /npm run ([a-zA-Z0-9:_-]+)/g;

type Finding = {
  path: string;
  message: string;
};

const failures: Finding[] = [];
const warnings: Finding[] = [];

function fail(path: string, message: string): void {
  failures.push({ path: repoPath(path), message });
}

function warn(path: string, message: string): void {
  warnings.push({ path: repoPath(path), message });
}

function absolute(path: string): string {
  return resolve(REPO_ROOT_FROM_SCRIPT, path);
}

function relativeToRepo(path: string): string {
  return repoPath(relative(REPO_ROOT_FROM_SCRIPT, path));
}

function lineCount(text: string): number {
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    return lines.length - 1;
  }
  return lines.length;
}

export function extractAdvertisedNpmScripts(markdown: string): Array<{ script: string; line: number }> {
  const results: Array<{ script: string; line: number }> = [];
  const lines = markdown.split(/\r\n|\n|\r/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(NPM_RUN_PATTERN)) {
      const script = match[1];
      if (script) {
        results.push({ script, line: index + 1 });
      }
    }
  }
  return results;
}

function walkSkillFiles(): string[] {
  const root = absolute(".agents/skills");
  if (!existsSync(root)) {
    return [];
  }
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        results.push(relativeToRepo(entryPath));
      }
    }
  }
  return results.sort();
}

function scanAdvertisedScripts(scripts: Record<string, string>): void {
  const paths = [...DOC_SCAN_PATHS, ...walkSkillFiles()];
  for (const path of paths) {
    const fullPath = absolute(path);
    if (!existsSync(fullPath)) {
      warn(path, "Advertised-script scan skipped; file missing.");
      continue;
    }
    const text = readFileSync(fullPath, "utf8");
    for (const { script, line } of extractAdvertisedNpmScripts(text)) {
      if (!scripts[script]) {
        fail(path, `Line ${line}: advertises missing npm script "${script}".`);
      }
    }
  }
}

function smokeCommand(command: string, label: string): string {
  try {
    const output = execSync(command, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail("package.json", `${label} failed: ${message}`);
    return "";
  }
}

function checkSmokeCommands(): void {
  const preflightOutput = smokeCommand("npm run agent:preflight", "agent:preflight");
  if (preflightOutput) {
    const lines = lineCount(preflightOutput);
    if (lines > PREFLIGHT_LINE_BUDGET) {
      fail(
        "scripts/agent-preflight.ts",
        `agent:preflight output has ${lines} lines; budget is <= ${PREFLIGHT_LINE_BUDGET}.`
      );
    }
  }

  smokeCommand("npm run agent:auto-check -- --dry-run", "agent:auto-check --dry-run");
  smokeCommand("npm run agent:tests-for -- --changed", "agent:tests-for --changed");
}

function checkPortableRoster(scripts: Record<string, string>): void {
  for (const script of PORTABLE_SCRIPTS) {
    if (!scripts[script]) {
      fail("package.json", `Missing portable-contract npm script "${script}".`);
    }
  }
}

function unionLikelyTestsFromFiles(files: string[]): string[] {
  const tests = new Set<string>();
  for (const file of files) {
    for (const test of likelyTestsFor(file).existing) {
      tests.add(test);
    }
  }
  return Array.from(tests).sort();
}

function assertTestsAlign(files: string[], label: string): void {
  const collected = collectLikelyTestsForFiles(files);
  const union = unionLikelyTestsFromFiles(files);
  if (collected.join("\n") !== union.join("\n")) {
    fail(
      "scripts/agent-utils.ts",
      `${label}: collectLikelyTestsForFiles disagrees with likelyTestsFor union.`
    );
  }
}

function checkFixtureAlignment(): void {
  const fixtures: Array<{ label: string; files: string[]; area?: string; includesTest?: string }> = [
    {
      label: "core actions",
      files: ["src/core/actions.ts"],
      area: "core-board-product-logic",
      includesTest: "src/core/actions.test.ts"
    },
    {
      label: "job scout runner client",
      files: ["src/core/jobScoutRunnerClient.ts"],
      area: "career-job-scout"
    },
    {
      label: "ai gateway",
      files: ["services/ai-gateway/app/main.py"],
      area: "ai-gateway"
    },
    {
      label: "docs planning",
      files: ["docs/README.md"],
      area: "docs-planning"
    }
  ];

  for (const fixture of fixtures) {
    for (const file of fixture.files) {
      if (fixture.area && taskAreaForPath(file) !== fixture.area) {
        fail(
          "scripts/agent-utils.ts",
          `${fixture.label}: expected taskAreaForPath("${file}") === "${fixture.area}", got "${taskAreaForPath(file)}".`
        );
      }
    }
    assertTestsAlign(fixture.files, fixture.label);
    if (fixture.includesTest) {
      const tests = collectLikelyTestsForFiles(fixture.files);
      if (!tests.includes(fixture.includesTest)) {
        fail(
          "scripts/agent-utils.ts",
          `${fixture.label}: expected likely tests to include ${fixture.includesTest}.`
        );
      }
    }
    const tests = collectLikelyTestsForFiles(fixture.files);
    if (fixture.label === "job scout runner client" && tests.length === 0) {
      fail("scripts/agent-utils.ts", `${fixture.label}: expected non-empty likely tests.`);
    }
  }

  const changed = changedFilePaths();
  if (changed.length > 0) {
    assertTestsAlign(changed, "live dirty tree");
  } else {
    warn("git", "Clean working tree; live dirty-tree alignment skipped.");
  }
}

function main(): void {
  const scripts = packageScripts();
  checkPortableRoster(scripts);
  scanAdvertisedScripts(scripts);
  checkFixtureAlignment();
  checkSmokeCommands();

  const status = failures.length === 0 ? "PASS" : "FAIL";
  console.log(`Agent script claims check: ${status}`);
  console.log(`Checks: portable roster, doc npm scripts, fixture alignment, command smoke`);

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

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main();
}
