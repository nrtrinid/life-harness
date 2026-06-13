import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { buildCareerSourcePackFromMarkdown } from "../src/core/careerSourcePackBuilder";
import {
  collectCareerSourceMarkdownFiles,
  formatCareerPackValidationLines,
  isPlaceholderCareerSource,
  LOCAL_CAREER_PACK_OUTPUT,
  LOCAL_CAREER_SOURCE_DIR,
  PLACEHOLDER_CAREER_SOURCE_MESSAGE,
  validateCareerSourcePackJson
} from "../src/core/careerSourcePackLocal";

interface CliOptions {
  source: string;
  out: string;
  validateOnly: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    source: LOCAL_CAREER_SOURCE_DIR,
    out: LOCAL_CAREER_PACK_OUTPUT,
    validateOnly: false
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--source") {
      options.source = argv[++index] ?? options.source;
    } else if (arg === "--out") {
      options.out = argv[++index] ?? options.out;
    } else if (arg === "--validate-only") {
      options.validateOnly = true;
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(options.source);
const outPath = resolve(options.out);

if (!options.validateOnly) {
  if (!existsSync(sourceRoot)) {
    throw new Error(
      `Career source directory not found: ${sourceRoot}. Create private/career-source/ and copy markdown evidence first.`
    );
  }

  const sourceFiles = collectCareerSourceMarkdownFiles(sourceRoot);
  if (isPlaceholderCareerSource(sourceFiles)) {
    throw new Error(PLACEHOLDER_CAREER_SOURCE_MESSAGE);
  }

  const built = buildCareerSourcePackFromMarkdown({
    files: sourceFiles,
    sourceRepo: sourceRoot
  });

  if (!built.ok) {
    for (const warning of built.warnings) {
      console.warn(`Warning: ${warning}`);
    }
    throw new Error(`Career Source Pack build failed: ${built.error}`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(built.pack, null, 2)}\n`, "utf8");
  console.log(`Built ${outPath}`);
  for (const warning of built.warnings) {
    console.warn(`Build warning: ${warning}`);
  }
} else if (!existsSync(outPath)) {
  throw new Error(`Pack file not found: ${outPath}. Run npm run career:pack:build:local first.`);
}

const json = readFileSync(outPath, "utf8");
const validated = validateCareerSourcePackJson(json);
for (const line of formatCareerPackValidationLines(validated)) {
  console.log(line);
}

if (!validated.ok) {
  process.exitCode = 1;
}
