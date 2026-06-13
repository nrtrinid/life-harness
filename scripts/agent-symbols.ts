import { existsSync } from "node:fs";

import { absolute, likelyTestsFor, lineCount, parseArgs, readLines, repoPath } from "./agent-utils";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function summarize(file: string): void {
  const rel = repoPath(file);
  if (!existsSync(absolute(rel))) {
    console.log(`## ${rel}`);
    console.log("- missing");
    return;
  }
  const lines = readLines(rel);
  const imports = unique(
    lines
      .filter((line) => /^\s*import\b/.test(line))
      .map((line) => line.replace(/\s+/g, " ").trim().slice(0, 140))
  );
  const exports = unique(
    lines
      .map((line) => /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|type|interface|const|let|var)\s+([A-Za-z0-9_]+)/.exec(line)?.[1] ?? "")
      .filter(Boolean)
  );
  const topLevel = unique(
    lines
      .map((line) => /^(?:export\s+)?(?:async\s+)?(?:function|class|type|interface|const)\s+([A-Za-z0-9_]+)/.exec(line)?.[1] ?? "")
      .filter(Boolean)
  );
  const tests = likelyTestsFor(rel);

  console.log(`## ${rel}`);
  console.log(`Lines: ${lineCount(rel)}`);
  console.log(`Imports (${imports.length}):`);
  for (const item of imports.slice(0, 20)) console.log(`- ${item}`);
  if (imports.length > 20) console.log(`- ... truncated ${imports.length - 20} more`);
  console.log(`Exports: ${exports.length ? exports.join(", ") : "(none found)"}`);
  console.log(`Top-level: ${topLevel.length ? topLevel.join(", ") : "(none found)"}`);
  console.log(`Likely tests: ${tests.existing.length ? tests.existing.join(", ") : "no obvious test found"}`);
  console.log("");
}

function main(): void {
  const { positionals } = parseArgs(process.argv.slice(2));
  if (positionals.length === 0) {
    console.error("Usage: npm run agent:symbols -- <file> [file...]");
    process.exitCode = 1;
    return;
  }
  for (const file of positionals.slice(0, 20)) {
    summarize(file);
  }
  if (positionals.length > 20) console.log(`... truncated ${positionals.length - 20} more files`);
}

main();
