import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { buildCareerSourcePackFromMarkdown } from "../src/core/careerSourcePackBuilder";

interface CliOptions {
  source?: string;
  out?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--source") {
      options.source = argv[++index];
    } else if (arg === "--out") {
      options.out = argv[++index];
    }
  }
  return options;
}

function collectMarkdownFiles(root: string, dir = root): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(root, fullPath));
      continue;
    }
    if (!entry.isFile() || !/\.(md|txt)$/i.test(entry.name)) {
      continue;
    }
    files.push({
      path: relative(root, fullPath).replace(/\\/g, "/"),
      content: readFileSync(fullPath, "utf8")
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

const options = parseArgs(process.argv.slice(2));
if (!options.source || !options.out) {
  throw new Error("Usage: npm run career:pack:build -- --source ../career-source --out resume_pack/life_harness_career_pack.v1.json");
}

const sourceRoot = resolve(options.source);
const outPath = resolve(options.out);
const result = buildCareerSourcePackFromMarkdown({
  files: collectMarkdownFiles(sourceRoot),
  sourceRepo: sourceRoot
});

if (!result.ok) {
  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }
  throw new Error(`Career Source Pack build failed: ${result.error}`);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(result.pack, null, 2)}\n`, "utf8");

console.log(`Wrote ${outPath}`);
console.log(`${result.pack.resumeModules.length} modules, ${result.pack.roleRecipes.length} role recipes, ${result.pack.interviewStories.length} interview stories`);
for (const warning of result.warnings) {
  console.warn(`Warning: ${warning}`);
}
