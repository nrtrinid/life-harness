import { existsSync, statSync } from "node:fs";

import { absolute, parseArgs, readLines, repoPath, truncateList, walkTextFiles } from "./agent-utils";

function exportedNames(file: string): string[] {
  const names: string[] = [];
  for (const line of readLines(file)) {
    const direct = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|type|interface|const|let|var)\s+([A-Za-z0-9_]+)/.exec(line);
    if (direct?.[1]) names.push(direct[1]);
    const grouped = /^\s*export\s+\{([^}]+)\}/.exec(line);
    if (grouped?.[1]) {
      for (const part of grouped[1].split(",")) {
        names.push(part.trim().split(/\s+as\s+/)[1] ?? part.trim().split(/\s+as\s+/)[0]);
      }
    }
  }
  return Array.from(new Set(names.filter(Boolean))).sort();
}

function main(): void {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const target = positionals[0];
  const maxFiles = Number(flags.get("max-files") ?? 80);
  if (!target) {
    console.error("Usage: npm run agent:exports -- <file-or-directory>");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(absolute(target))) {
    console.error(`Missing target: ${target}`);
    process.exitCode = 1;
    return;
  }
  const stats = statSync(absolute(target));
  const files = stats.isDirectory()
    ? walkTextFiles(target, { maxBytes: 180_000 }).filter((file) => /\.(ts|tsx|js|jsx)$/.test(file))
    : [repoPath(target)];
  const withExports = files
    .map((file) => ({ file, names: exportedNames(file) }))
    .filter((item) => item.names.length > 0);
  const bounded = truncateList(withExports, Number.isFinite(maxFiles) ? maxFiles : 80);
  console.log(`# Exports: ${target}`);
  for (const item of bounded.shown) {
    console.log(`- ${item.file}: ${item.names.join(", ")}`);
  }
  if (bounded.omitted) console.log(`- ... truncated ${bounded.omitted} more files`);
  if (withExports.length === 0) console.log("- no export declarations found");
}

main();
