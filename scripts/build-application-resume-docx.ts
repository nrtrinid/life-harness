import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildApplicationResumeDocxDraftFromState } from "../src/core/applicationResumeExport";
import { packResumeDocx, type ResumeProfile } from "../src/core/resumeDocx";
import { parseImportJson } from "../src/storage/persistence";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function main() {
  const snapshotPath = readArg("--snapshot");
  const cardId = readArg("--cardId");
  const profilePath = readArg("--profile");
  const outPath = readArg("--out");

  if (!snapshotPath || !cardId || !profilePath || !outPath) {
    throw new Error(
      "Usage: npm run resume:build:application -- --snapshot fixtures/resume/application.snapshot.sample.json --cardId card_sample_application --profile fixtures/resume/profile.sample.json --out tmp/resumes/sample-application.docx"
    );
  }

  const snapshotRaw = await readFile(resolve(snapshotPath), "utf8");
  const profileRaw = await readFile(resolve(profilePath), "utf8");
  const parsed = parseImportJson(snapshotRaw);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? "Snapshot import failed.");
  }

  const profile = JSON.parse(profileRaw) as ResumeProfile;
  const result = buildApplicationResumeDocxDraftFromState(parsed.data, cardId, profile);
  if (!result.ok) {
    throw new Error(`Cannot export resume:\n- ${result.errors.join("\n- ")}`);
  }

  const absoluteOut = resolve(outPath);
  const buffer = await packResumeDocx(result.draft);
  await mkdir(dirname(absoluteOut), { recursive: true });
  await writeFile(absoluteOut, buffer);
  console.log(`Wrote ${absoluteOut}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
