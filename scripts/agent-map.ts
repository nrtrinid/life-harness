import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";

import {
  REPO_ROOT,
  changedFilePaths,
  currentBranch,
  findTaskBlock,
  gitStatusLines,
  likelyTestsFor,
  numberFlag,
  packageScripts,
  parseArgs,
  parseTaskBlocks,
  repoPath,
  taskAreaForPath,
  truncateList,
  walkTextFiles
} from "./agent-utils";

function printBounded(lines: string[], maxLines: number): void {
  const { shown, omitted } = truncateList(lines, maxLines);
  for (const line of shown) {
    console.log(line);
  }
  if (omitted > 0) {
    console.log(`... truncated ${omitted} lines; rerun with --max-lines <n> for more`);
  }
}

function dirs(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function networkFiles(): string[] {
  return walkTextFiles("src", { maxBytes: 160_000 }).filter((file) => {
    const lower = file.toLowerCase();
    return lower.includes("client") || lower.includes("gateway") || lower.includes("runner");
  });
}

function main(): void {
  const { flags } = parseArgs(process.argv.slice(2));
  const maxLines = numberFlag(flags, "max-lines", 300);
  const task = typeof flags.get("task") === "string" ? String(flags.get("task")) : null;
  const changedOnly = flags.has("changed");
  const lines: string[] = [];

  lines.push(`# Agent Repo Map: ${basename(REPO_ROOT)}`);
  lines.push(`Branch: ${currentBranch()}`);
  lines.push("Output is a map, not a substitute for targeted reads.");
  lines.push("");

  if (task) {
    const block = findTaskBlock(task);
    lines.push(`## Task Block: ${task}`);
    lines.push(block ? block.body : `No task block found for ${task}.`);
    printBounded(lines, maxLines);
    return;
  }

  const changed = changedFilePaths();
  lines.push(`## Changed Files (${changed.length})`);
  const changedShown = truncateList(gitStatusLines(), changedOnly ? 80 : 30);
  lines.push(...(changedShown.shown.length ? changedShown.shown.map((line) => `- ${line}`) : ["- none"]));
  if (changedShown.omitted) lines.push(`- ... truncated ${changedShown.omitted} more`);

  if (changedOnly && changed.length > 0) {
    lines.push("");
    lines.push("## Changed File Test Hints");
    for (const file of truncateList(changed, 20).shown) {
      const tests = likelyTestsFor(file);
      lines.push(`- ${file} (${taskAreaForPath(file)})`);
      lines.push(`  tests: ${tests.existing.length ? tests.existing.join(", ") : "no obvious test found"}`);
    }
  }

  const scripts = packageScripts();
  lines.push("");
  lines.push("## Package Scripts");
  for (const name of Object.keys(scripts).sort()) {
    lines.push(`- ${name}`);
  }

  lines.push("");
  lines.push("## Pointers");
  lines.push("- AGENTS.md");
  lines.push("- docs/AGENT_BUDGETS.md");
  lines.push("- docs/AGENT_CONTEXT_MAP.md");

  lines.push("");
  lines.push("## Task Blocks");
  for (const block of parseTaskBlocks()) {
    lines.push(`- ${block.name}`);
  }

  lines.push("");
  lines.push("## App/Route Directories");
  lines.push(`- app/: ${dirs(`${REPO_ROOT}/app`).join(", ") || "(none)"}`);
  lines.push(`- src/: ${dirs(`${REPO_ROOT}/src`).join(", ") || "(none)"}`);
  lines.push(`- services/: ${dirs(`${REPO_ROOT}/services`).join(", ") || "(none)"}`);

  lines.push("");
  lines.push("## Likely Source Roots");
  for (const root of ["app", "src/core", "src/components", "src/state", "src/data", "services"]) {
    if (existsSync(`${REPO_ROOT}/${root}`)) lines.push(`- ${root}`);
  }

  lines.push("");
  lines.push("## Likely Test Roots");
  for (const root of ["src/core", "src/components", "services/job-scout-runner/tests", "services/ai-gateway/tests"]) {
    if (existsSync(`${REPO_ROOT}/${root}`)) lines.push(`- ${root}`);
  }

  lines.push("");
  lines.push("## Network/Fetch/Client Files");
  const clients = truncateList(networkFiles(), 40);
  lines.push(...clients.shown.map((file) => `- ${repoPath(file)}`));
  if (clients.omitted) lines.push(`- ... truncated ${clients.omitted} more`);

  printBounded(lines, maxLines);
}

main();
