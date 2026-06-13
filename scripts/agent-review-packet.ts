import { changedFilePaths, currentBranch, gitStatusLines, likelyTestsFor, recommendedChecks, taskAreaForPath, truncateList } from "./agent-utils";
import { latestFailureSummary } from "./agent-run-command";

const changed = changedFilePaths();
const statuses = gitStatusLines();
const areas = new Map<string, string[]>();
for (const file of changed) {
  const area = taskAreaForPath(file);
  areas.set(area, [...(areas.get(area) ?? []), file]);
}

function boundaryRisks(files: string[]): string[] {
  const risks: string[] = [];
  if (files.some((file) => file === "package.json" || file.endsWith("package-lock.json"))) {
    risks.push("package/dependency changes present");
  }
  if (files.some((file) => /schema|migration|storage|persistence/i.test(file))) {
    risks.push("persistence/schema-adjacent files touched");
  }
  if (files.some((file) => file.startsWith("app/") || file.startsWith("src/"))) {
    risks.push("check app/src does not import from services");
  }
  if (files.some((file) => file.startsWith("src/core/"))) {
    risks.push("check core logic remains UI-independent");
  }
  if (files.some((file) => /rawLab|raw-lab/i.test(file))) {
    risks.push("check Raw Lab does not import board state/actions or weaken containment");
  }
  if (files.some((file) => /askHarness|chatHarness|harnessContext/i.test(file))) {
    risks.push("check Ask Harness does not import Raw Lab personality/thread internals");
  }
  return risks.length > 0 ? risks : ["no obvious boundary risks from path scan"];
}

const likelyTests = new Set<string>();
for (const file of changed) {
  for (const test of likelyTestsFor(file).existing) {
    likelyTests.add(test);
  }
}

const latest = latestFailureSummary();
const { shown: shownStatus, omitted: omittedStatus } = truncateList(statuses, 40);
const { shown: shownTests, omitted: omittedTests } = truncateList(Array.from(likelyTests), 20);

console.log("# Agent Review Packet");
console.log(`Branch: ${currentBranch()}`);
console.log(`Changed files: ${changed.length}`);
console.log("");
console.log("## Git Status");
if (shownStatus.length === 0) {
  console.log("- clean");
} else {
  for (const line of shownStatus) console.log(`- ${line}`);
  if (omittedStatus > 0) console.log(`- ... ${omittedStatus} more`);
}
console.log("");
console.log("## Areas");
if (areas.size === 0) {
  console.log("- none");
} else {
  for (const [area, files] of Array.from(areas.entries()).sort()) {
    console.log(`- ${area}: ${files.length}`);
  }
}
console.log("");
console.log("## Likely Tests");
if (shownTests.length === 0) {
  console.log("- no obvious test files found");
} else {
  for (const test of shownTests) console.log(`- ${test}`);
  if (omittedTests > 0) console.log(`- ... ${omittedTests} more`);
}
console.log("");
console.log("## Boundary Risks");
for (const risk of boundaryRisks(changed)) console.log(`- ${risk}`);
console.log("");
console.log("## Recommended Checks");
for (const check of recommendedChecks(changed)) console.log(`- ${check}`);
console.log("");
console.log("## Latest Agent Log");
if (!latest) {
  console.log("- no agent logs found");
} else {
  console.log(`- command: ${latest.command}`);
  console.log(`- result: ${latest.passed === true ? "PASS" : latest.passed === false ? "FAIL" : "UNKNOWN"}`);
  console.log(`- raw log: ${latest.logPath}`);
  console.log(`- first failure: ${latest.firstFailure ?? "(none)"}`);
  console.log(`- narrow rerun: ${latest.narrowRerun ?? "(none)"}`);
}
console.log("");
console.log("## Review Focus");
console.log("- verify the changed-file area matches the ticket scope");
console.log("- inspect listed boundary risks before broad refactors");
console.log("- prefer likely tests and recommended checks before full-suite reruns");
