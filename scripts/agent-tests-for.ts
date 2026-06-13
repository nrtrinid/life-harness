import { changedFilePaths, likelyTestsFor, parseArgs } from "./agent-utils";

function sourceFiles(args: string[], changed: boolean): string[] {
  if (changed) {
    return changedFilePaths().filter((file) => /\.(ts|tsx|js|jsx|py)$/.test(file));
  }
  return args;
}

function main(): void {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  const files = sourceFiles(positionals, flags.has("changed"));
  if (files.length === 0) {
    console.log("No source files provided or changed.");
    return;
  }
  for (const file of files.slice(0, 50)) {
    const tests = likelyTestsFor(file);
    console.log(`## ${file}`);
    if (tests.existing.length === 1 && tests.existing[0] === file) {
      const command = file.endsWith(".py")
        ? `cd services/ai-gateway; pytest ${file.replace(/^services\/ai-gateway\//, "")} -q`
        : `npm run test -- ${file}`;
      console.log("This is already a test file.");
      console.log(`Recommended: ${command}`);
      console.log("");
      continue;
    }
    console.log(`Existing tests: ${tests.existing.length ? tests.existing.join(", ") : "no obvious test found"}`);
    console.log(`Possible names: ${tests.possible.slice(0, 6).join(", ") || "(none)"}`);
    if (tests.existing.length > 0) {
      const first = tests.existing[0];
      const command = first.endsWith(".py")
        ? `cd services/ai-gateway; pytest ${first.replace(/^services\/ai-gateway\//, "")} -q`
        : `npm run test -- ${first}`;
      console.log(`Recommended: ${command}`);
    }
    console.log("");
  }
  if (files.length > 50) console.log(`... truncated ${files.length - 50} more files`);
}

main();
