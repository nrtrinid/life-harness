import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { buildCareerSourcePackFromMarkdown } from "../src/core/careerSourcePackBuilder";
import { collectCareerSourceMarkdownFiles } from "../src/core/careerSourcePackLocal";

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

const options = parseArgs(process.argv.slice(2));
if (!options.source || !options.out) {
  throw new Error(
    [
      "Missing --source and --out.",
      "Local private source: npm run career:pack:build:local",
      "External repo: npm run career:pack:build -- --source ../career-source --out resume_pack/life_harness_career_pack.v1.json"
    ].join(" ")
  );
}

const sourceRoot = resolve(options.source);
const outPath = resolve(options.out);
const result = buildCareerSourcePackFromMarkdown({
  files: collectCareerSourceMarkdownFiles(sourceRoot),
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
