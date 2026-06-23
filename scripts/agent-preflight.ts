import {
  changedFilePaths,
  currentBranch,
  gitStatusLines,
  likelyTestsFor,
  packageScripts,
  parseArgs,
  parseTaskBlocks,
  readAgentIgnore,
  taskAreaForPath,
  truncateList
} from "./agent-utils";
import { basename } from "node:path";
import { REPO_ROOT } from "./agent-utils";
import { execSync } from "node:child_process";

const STATUS_LIMIT = 30;
const TEST_LIMIT = 20;
const IGNORE_LIMIT = 30;

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function boundaryRisks(files: string[]): string[] {
  const risks: string[] = [];
  if (files.some((file) => file === "package.json" || /(?:^|\/)(?:package-lock|yarn.lock|pnpm-lock)\./.test(file))) {
    risks.push("package/dependency changes require explicit scope");
  }
  if (files.some((file) => /schema|migration|storage|persistence/i.test(file))) {
    risks.push("persistence/schema-adjacent paths touched");
  }
  if (files.some((file) => file.startsWith("app/") || file.startsWith("src/"))) {
    risks.push("check app/src does not import from services");
  }
  if (files.some((file) => file.startsWith("src/core/"))) {
    risks.push("check core logic remains UI-independent");
  }
  if (files.some((file) => /rawLab|raw-lab|services\/ai-gateway/i.test(file))) {
    risks.push("check Raw Lab and gateway containment boundaries");
  }
  if (files.some((file) => /askHarness|chatHarness|harnessContext/i.test(file))) {
    risks.push("check Ask Harness does not import Raw Lab internals");
  }
  return risks.length > 0 ? risks : ["no obvious boundary risks from path scan"];
}

function taskBlocksForAreas(areas: string[]): string[] {
  const blocks = new Set(parseTaskBlocks().map((block) => block.name));
  return areas.filter((area) => blocks.has(area));
}

function likelyTests(files: string[]): string[] {
  const tests = new Set<string>();
  for (const file of files) {
    for (const test of likelyTestsFor(file).existing) {
      tests.add(test);
    }
  }
  return Array.from(tests).sort();
}

function recommendedFirstCommands(areas: string[], tests: string[]): string[] {
  const scripts = packageScripts();
  const commands: string[] = [];
  for (const area of areas) {
    if (area !== "unknown/mixed") {
      commands.push(`npm run agent:map -- --task ${area}`);
    }
  }
  commands.push("npm run agent:impact -- --changed");
  commands.push("npm run agent:tests-for -- --changed");
  if (tests.length > 0) {
    commands.push(`npm run agent:test -- -- ${tests.slice(0, 3).join(" ")}`);
  }
  if (scripts["check:boundaries"]) {
    commands.push("npm run check:boundaries");
  }
  return Array.from(new Set(commands));
}

function printList(items: string[], empty: string, limit: number): void {
  const { shown, omitted } = truncateList(items, limit);
  if (shown.length === 0) {
    console.log(`- ${empty}`);
    return;
  }
  for (const item of shown) {
    console.log(`- ${item}`);
  }
  if (omitted > 0) {
    console.log(`- ... ${omitted} more`);
  }
}

function printBootstrapOrientation(): void {
  // Intentionally uses the existing bootstrap output for backwards-compatible repo orientation.
  // We keep bootstrap as an internal helper surfaced via `agent:preflight -- --bootstrap`.
  const output = execSync("npm run agent:bootstrap", {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  console.log(output.trimEnd());
}

function main(): void {
  const { flags } = parseArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
  const includeBootstrap = flags.has("bootstrap");

  const repoName = basename(REPO_ROOT);
  const branch = currentBranch();
  const statuses = gitStatusLines();
  const files = changedFilePaths();
  const areas = uniqueSorted(files.map(taskAreaForPath));
  const taskBlocks = taskBlocksForAreas(areas);
  const tests = likelyTests(files);
  const ignoreEntries = readAgentIgnore();

  console.log(`# Agent Preflight: ${repoName}`);
  console.log(`Branch: ${branch}`);
  console.log(`Changed files: ${files.length}`);
  console.log("");

  console.log("## Changed Files");
  printList(statuses, "none", STATUS_LIMIT);
  console.log("");

  console.log("## Likely Task Areas");
  printList(areas, files.length === 0 ? "none yet; use the ticket to choose a task map" : "unknown", 12);
  console.log("");

  console.log("## Matching Context Map Tasks");
  printList(taskBlocks, "none found; use targeted grep/symbols from the ticket", 12);
  console.log("");

  console.log("## Likely Tests");
  printList(tests, "no obvious existing tests found", TEST_LIMIT);
  console.log("");

  console.log("## Recommended First Commands");
  console.log("- npm run agent:preflight (this command)");
  for (const command of recommendedFirstCommands(areas, tests)) console.log(`- ${command}`);
  if (includeBootstrap) {
    console.log("");
    console.log("## Bootstrap Orientation (compat helper)");
    printBootstrapOrientation();
  } else {
    console.log("- optional: npm run agent:preflight -- --bootstrap (compat repo orientation)");
  }
  console.log("");

  console.log("## Boundary Risks");
  for (const risk of boundaryRisks(files)) {
    console.log(`- ${risk}`);
  }
  console.log("");

  console.log("## Do Not Read By Default");
  printList(ignoreEntries, ".agentignore missing or empty", IGNORE_LIMIT);
  console.log("");

  console.log("## Reminders");
  console.log("- Prefer targeted `npm run agent:grep -- \"<term>\"` over broad reads.");
  console.log("- Use `npm run agent:symbols -- <file>` before opening neighbors.");
  console.log("- Run narrow tests before broad app checks.");
}

main();
