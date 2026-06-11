import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { packResumeDocx, type ResumeDocxDraft } from "../src/core/resumeDocx";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function main() {
  const inputPath = readArg("--input");
  const outPath = readArg("--out");

  if (!inputPath || !outPath) {
    throw new Error("Usage: npm run resume:build -- --input fixtures/resume/general.sample.json --out tmp/resume.docx");
  }

  const absoluteInput = resolve(inputPath);
  const absoluteOut = resolve(outPath);
  const raw = await readFile(absoluteInput, "utf8");
  const draft = JSON.parse(raw) as ResumeDocxDraft;
  const buffer = await packResumeDocx(draft);

  await mkdir(dirname(absoluteOut), { recursive: true });
  await writeFile(absoluteOut, buffer);
  console.log(`Wrote ${absoluteOut}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
