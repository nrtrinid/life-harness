import { runAgentCommand, type FailureSummary } from "./agent-run-command";
import {
  changedFilePaths,
  packageScripts,
  parseArgs,
  taskAreaForPath,
  truncateList
} from "./agent-utils";

type CheckPlan = {
  classification: string;
  checks: string[];
  warnings: string[];
};

function hasAny(files: string[], predicate: (file: string) => boolean): boolean {
  return files.some(predicate);
}

function scriptCommand(scriptName: string): string | null {
  return packageScripts()[scriptName] ? `npm run ${scriptName}` : null;
}

function compactUnique(commands: Array<string | null>): string[] {
  return Array.from(new Set(commands.filter((command): command is string => Boolean(command))));
}

function classify(files: string[], docsOnlyFlag: boolean): string {
  if (docsOnlyFlag) {
    return "docs/instructions only";
  }
  if (files.length === 0) {
    return "no changes";
  }

  const docsOnly = files.every((file) =>
    file === "AGENTS.md" ||
    file === ".agentignore" ||
    file.startsWith("docs/") ||
    file.startsWith(".agents/skills/") ||
    /\.md$/.test(file)
  );
  if (docsOnly) {
    return "docs/instructions only";
  }
  if (hasAny(files, (file) => file.startsWith("scripts/") || file.startsWith(".codex/"))) {
    return "agent tooling/hooks";
  }
  if (hasAny(files, (file) => file === "package.json" || /(?:^|\/)(?:package-lock|yarn.lock|pnpm-lock)\./.test(file))) {
    return "package/dependency";
  }
  if (hasAny(files, (file) => taskAreaForPath(file) === "career-job-scout")) {
    return "job scout";
  }
  if (hasAny(files, (file) => taskAreaForPath(file) === "raw-lab-containment" || file.startsWith("services/ai-gateway/"))) {
    return "Raw Lab / ai-gateway";
  }
  if (hasAny(files, (file) => file.startsWith("src/core/") && /\.(ts|tsx)$/.test(file))) {
    return "core TypeScript";
  }
  if (hasAny(files, (file) => (file.startsWith("app/") || file.startsWith("src/components/") || file.startsWith("src/state/")) && /\.(ts|tsx)$/.test(file))) {
    return "app/UI TypeScript";
  }
  return "mixed/unknown";
}

function checksFor(classification: string, full: boolean): CheckPlan {
  const warnings: string[] = [];
  if (full && scriptCommand("agent:verify")) {
    return {
      classification,
      checks: ["npm run agent:verify"],
      warnings
    };
  }

  if (classification === "docs/instructions only") {
    return {
      classification,
      checks: compactUnique([
        scriptCommand("check:agent-budget"),
        scriptCommand("check:boundaries"),
        scriptCommand("agent:review-packet")
      ]),
      warnings
    };
  }

  if (classification === "agent tooling/hooks") {
    return {
      classification,
      checks: compactUnique([
        scriptCommand("check:agent-budget"),
        scriptCommand("codex:hooks:smoke"),
        scriptCommand("check:boundaries"),
        scriptCommand("agent:review-packet")
      ]),
      warnings
    };
  }

  if (classification === "core TypeScript") {
    return {
      classification,
      checks: compactUnique([
        scriptCommand("agent:typecheck"),
        scriptCommand("verify:core"),
        scriptCommand("check:boundaries"),
        scriptCommand("agent:review-packet")
      ]),
      warnings
    };
  }

  if (classification === "job scout") {
    return {
      classification,
      checks: compactUnique([
        scriptCommand("verify:job-scout"),
        scriptCommand("check:boundaries"),
        scriptCommand("agent:review-packet")
      ]),
      warnings
    };
  }

  if (classification === "app/UI TypeScript") {
    return {
      classification,
      checks: compactUnique([
        scriptCommand("agent:typecheck"),
        scriptCommand("check:boundaries"),
        scriptCommand("agent:review-packet")
      ]),
      warnings
    };
  }

  if (classification === "Raw Lab / ai-gateway") {
    return {
      classification,
      checks: compactUnique([scriptCommand("check:boundaries"), scriptCommand("agent:review-packet")]),
      warnings
    };
  }

  if (classification === "package/dependency") {
    warnings.push("Package/dependency changes require explicit scope.");
    return {
      classification,
      checks: compactUnique([
        scriptCommand("check:boundaries"),
        scriptCommand("check:agent-budget"),
        scriptCommand("agent:review-packet")
      ]),
      warnings
    };
  }

  return {
    classification,
    checks: compactUnique([
      scriptCommand("agent:typecheck"),
      scriptCommand("check:boundaries"),
      scriptCommand("agent:review-packet")
    ]),
    warnings
  };
}

function packageFilesChanged(files: string[]): boolean {
  return hasAny(files, (file) => file === "package.json" || /(?:^|\/)(?:package-lock|yarn.lock|pnpm-lock)\./.test(file));
}

function printChangedFiles(files: string[]): void {
  const { shown, omitted } = truncateList(files, 25);
  if (shown.length === 0) {
    console.log("- none");
    return;
  }
  for (const file of shown) {
    console.log(`- ${file} (${taskAreaForPath(file)})`);
  }
  if (omitted > 0) {
    console.log(`- ... ${omitted} more`);
  }
}

function printResult(summary: FailureSummary): void {
  console.log(
    `- ${summary.passed === true ? "PASS" : summary.passed === false ? "FAIL" : "UNKNOWN"}: ${summary.command}`
  );
  console.log(`  raw log: ${summary.logPath}`);
  if (summary.firstFailure) {
    console.log(`  first failure: ${summary.firstFailure}`);
  }
  if (summary.narrowRerun) {
    console.log(`  narrow rerun: ${summary.narrowRerun}`);
  }
}

function main(): void {
  const { flags } = parseArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
  const files = changedFilePaths();
  const dryRun = flags.has("dry-run");
  const full = flags.has("full");
  const classification = classify(files, flags.has("docs-only"));
  const plan = checksFor(classification, full);
  if (packageFilesChanged(files) && !plan.warnings.includes("Package/dependency changes require explicit scope.")) {
    plan.warnings.push("Package/dependency changes require explicit scope.");
  }

  console.log("# Agent Auto-Check");
  console.log(`Classification: ${plan.classification}`);
  console.log(`Changed files: ${files.length}`);
  console.log("");

  console.log("## Changed Files");
  printChangedFiles(files);
  console.log("");

  console.log("## Selected Checks");
  if (plan.checks.length === 0) {
    console.log("- none; no matching package scripts found");
  } else {
    for (const check of plan.checks) {
      console.log(`- ${check}`);
    }
  }
  for (const warning of plan.warnings) {
    console.log(`- warning: ${warning}`);
  }
  console.log("");

  if (dryRun) {
    console.log("## Result");
    console.log("- dry run; no checks executed");
    return;
  }

  console.log("## Checks Run");
  for (const check of plan.checks) {
    const summary = runAgentCommand("auto-check", check);
    printResult(summary);
    if (summary.passed === false) {
      console.log("");
      console.log("## Recommended Next Command");
      console.log(`- ${summary.narrowRerun ?? "npm run agent:failures"}`);
      process.exit(summary.exitCode ?? 1);
    }
  }

  console.log("");
  console.log("## Recommended Next Command");
  console.log("- npm run agent:review-packet");
}

main();
