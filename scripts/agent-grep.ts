import { readFileSync } from "node:fs";

import { absolute, numberFlag, parseArgs, truncateList, walkTextFiles } from "./agent-utils";

type Match = {
  file: string;
  lines: Array<{ number: number; text: string }>;
};

function main(): void {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  const query = positionals.join(" ").trim();
  const maxFiles = numberFlag(flags, "max-files", 40);
  const maxLines = numberFlag(flags, "max-lines", 80);
  const showContext = flags.has("context");

  if (!query) {
    console.error("Usage: npm run agent:grep -- <query> [--context] [--max-files 20]");
    process.exitCode = 1;
    return;
  }

  const needle = query.toLowerCase();
  const matches: Match[] = [];
  for (const file of walkTextFiles(".", { maxBytes: 250_000 })) {
    let text = "";
    try {
      text = readFileSync(absolute(file), "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r\n|\n|\r/);
    const found = lines
      .map((line, index) => ({ number: index + 1, text: line }))
      .filter((line) => line.text.toLowerCase().includes(needle));
    if (found.length > 0) {
      matches.push({ file, lines: found });
    }
  }

  const boundedFiles = truncateList(matches, maxFiles);
  console.log(`# agent:grep "${query}"`);
  console.log(`Matched files: ${matches.length}`);
  for (const match of boundedFiles.shown) {
    console.log(`- ${match.file} (${match.lines.length})`);
  }
  if (boundedFiles.omitted) console.log(`- ... truncated ${boundedFiles.omitted} more files`);

  if (showContext) {
    console.log("");
    console.log("## Context");
    let printed = 0;
    for (const match of boundedFiles.shown) {
      if (printed >= maxLines) break;
      console.log(`### ${match.file}`);
      for (const line of match.lines.slice(0, 5)) {
        if (printed >= maxLines) break;
        console.log(`${line.number}: ${line.text.trim()}`);
        printed += 1;
      }
      if (match.lines.length > 5) console.log(`... ${match.lines.length - 5} more matches in file`);
    }
    if (printed >= maxLines) console.log(`... context truncated at ${maxLines} lines`);
  } else {
    console.log("");
    console.log("Pass --context for bounded matching lines.");
  }
}

main();
