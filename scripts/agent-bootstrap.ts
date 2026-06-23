import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATUS_LIMIT = 40;
const IGNORE_LIMIT = 60;

function repoPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function run(command: string, options: { trim?: boolean } = { trim: true }): string | null {
  try {
    const output = execSync(command, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return options.trim === false ? output.replace(/[\r\n]+$/, "") : output.trim();
  } catch {
    return null;
  }
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(resolve(REPO_ROOT, path), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readAgentIgnore(): string[] {
  const path = resolve(REPO_ROOT, ".agentignore");
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function changedFiles(): string[] {
  const status = run("git status --short", { trim: false });
  if (!status) {
    return [];
  }
  return status.split(/\r?\n/).filter(Boolean);
}

function groupStatus(lines: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const line of lines) {
    const file = line.slice(3).trim().replace(/^"|"$/g, "");
    const normalized = repoPath(file);
    const group = normalized.includes("/") ? normalized.split("/")[0] : "(root)";
    const current = groups.get(group) ?? [];
    current.push(line);
    groups.set(group, current);
  }
  return groups;
}

function packageScripts(): Record<string, string> {
  const pkg = readJson("package.json");
  const scripts = pkg?.scripts;
  if (!scripts || typeof scripts !== "object") {
    return {};
  }
  return scripts as Record<string, string>;
}

function printList(items: string[], limit: number): void {
  const shown = items.slice(0, limit);
  for (const item of shown) {
    console.log(`- ${item}`);
  }
  if (items.length > limit) {
    console.log(`- ... truncated ${items.length - limit} more`);
  }
}

function main(): void {
  const repoName = basename(REPO_ROOT);
  const branch = run("git branch --show-current") || "(unknown)";
  const statusLines = changedFiles();
  const scripts = packageScripts();
  const ignoreEntries = readAgentIgnore();

  console.log(`# Agent Bootstrap: ${repoName}`);
  console.log("");
  console.log(`Branch: ${branch}`);
  console.log(`Changed files: ${statusLines.length}`);
  console.log("");

  console.log("## Changed Files");
  if (statusLines.length === 0) {
    console.log("- none");
  } else {
    const groups = groupStatus(statusLines);
    let printed = 0;
    for (const [group, lines] of groups) {
      if (printed >= STATUS_LIMIT) {
        break;
      }
      console.log(`- ${group}/`);
      for (const line of lines) {
        if (printed >= STATUS_LIMIT) {
          break;
        }
        console.log(`  - ${line}`);
        printed += 1;
      }
    }
    if (statusLines.length > STATUS_LIMIT) {
      console.log(`- ... truncated ${statusLines.length - STATUS_LIMIT} more changed entries`);
    }
  }

  console.log("");
  console.log("## Pointers");
  console.log("- Plan: docs/plans/agent-ergonomics-rtk-query-upgrade-plan.md");
  console.log("- Budgets: docs/AGENT_BUDGETS.md");
  console.log("- Context map: docs/AGENT_CONTEXT_MAP.md");
  if (existsSync(resolve(REPO_ROOT, "AGENTS.md"))) {
    console.log("- Root rules: AGENTS.md");
  }

  console.log("");
  console.log("## Suggested First Commands");
  console.log("- npm run agent:preflight");
  console.log("- npm run check:agent-budget");
  if (scripts["verify:core"]) {
    console.log("- npm run verify:core");
  }
  if (scripts["check:boundaries"]) {
    console.log("- npm run check:boundaries");
  }
  if (!scripts["verify:core"] && scripts.typecheck) {
    console.log("- npm run typecheck");
  }
  if (!scripts["verify:core"] && scripts.test) {
    console.log("- npm run test");
  }
  if (scripts["scout:runner:test"]) {
    console.log("- npm run scout:runner:test (only for Job Scout runner changes)");
  }

  console.log("");
  console.log("## Do Not Read By Default");
  if (ignoreEntries.length === 0) {
    console.log("- .agentignore missing or empty");
  } else {
    printList(ignoreEntries, IGNORE_LIMIT);
  }

  console.log("");
  console.log("## Reminders");
  console.log("- Read root AGENTS.md if present.");
  console.log("- Use docs/AGENT_CONTEXT_MAP.md.");
  console.log("- Prefer targeted search and narrow tests before broad repo reading.");
  console.log("- Do not start RTK, Redux, runtime app, persistence, or Raw Lab streaming work unless the ticket says so.");
}

main();
