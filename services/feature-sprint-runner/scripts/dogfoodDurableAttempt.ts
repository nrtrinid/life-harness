/**
 * Mock dogfood: claim → spawn once → simulate lost HTTP → status lookup → replay.
 * Also reloads journal after clearing in-flight (runner restart simulation).
 *
 * Usage (from repo root):
 *   npx tsx services/feature-sprint-runner/scripts/dogfoodDurableAttempt.ts
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { FeatureSprintRunnerRequest } from "../../../src/core/featureSprintRunner";
import {
  clearAttemptJournalInFlightForTests,
  getAttemptStatusFromJournal,
  runFeatureSprintPacketWithAttemptJournal
} from "../src/attemptJournal";
import { runFeatureSprintPacketOnRunner } from "../src/runPacket";

async function main() {
  process.env.FEATURE_SPRINT_RUNNER_MODE = "mock";
  const journalDir = await mkdtemp(path.join(os.tmpdir(), "fs-durable-dogfood-"));
  process.env.FEATURE_SPRINT_ATTEMPT_JOURNAL_DIR = journalDir;

  const attemptId = `fs_attempt-dogfood-${Date.now()}`;
  const request: FeatureSprintRunnerRequest = {
    profile: "codex_implementation",
    promptMarkdown: "Dogfood durable single-action execution.",
    planId: "plan-dogfood",
    stepId: "step-1",
    cardId: "card-1",
    repoPath: process.cwd(),
    worktree: { enabled: true },
    attemptId,
    attemptBinding: {
      planId: "plan-dogfood",
      actionId: "launch_implementation:dogfood",
      stateRevision: 1,
      profile: "codex_implementation",
      taskId: "task-1",
      phase: "implement"
    }
  };

  let spawnCount = 0;
  const runOnce = async (req: FeatureSprintRunnerRequest) => {
    spawnCount += 1;
    return runFeatureSprintPacketOnRunner(req);
  };

  console.log(`ATTEMPT_ID=${attemptId}`);
  console.log(`JOURNAL_DIR=${journalDir}`);

  const first = await runFeatureSprintPacketWithAttemptJournal(request, { journalDir, runOnce });
  if ("conflict" in first) {
    throw new Error(`Unexpected conflict: ${first.conflict.error}`);
  }
  if (!first.ok) {
    throw new Error(`First run failed: ${first.error}`);
  }
  console.log(`FIRST_OK=true SPAWN_COUNT=${spawnCount}`);

  // Simulate lost HTTP response: app still has claim, runner journal has completed result.
  clearAttemptJournalInFlightForTests();

  const status = await getAttemptStatusFromJournal(attemptId, journalDir);
  if (status.status !== "completed" || !status.result?.ok) {
    throw new Error(`Expected completed status after lost response, got ${status.status}`);
  }
  console.log(`STATUS_LOOKUP_OK=true RESULT_CHARS=${status.result.outputText?.length ?? 0}`);

  // Simulate runner process restart: clear in-flight, keep journal files.
  clearAttemptJournalInFlightForTests();
  const afterRestart = await getAttemptStatusFromJournal(attemptId, journalDir);
  if (afterRestart.status !== "completed" || !afterRestart.result?.ok) {
    throw new Error(`Expected completed after runner restart, got ${afterRestart.status}`);
  }
  console.log("RUNNER_RESTART_REPLAY_OK=true");

  const duplicate = await runFeatureSprintPacketWithAttemptJournal(request, { journalDir, runOnce });
  if ("conflict" in duplicate) {
    throw new Error(`Unexpected conflict on duplicate: ${duplicate.conflict.error}`);
  }
  if (spawnCount !== 1) {
    throw new Error(`Expected spawnCount=1 after duplicate POST, got ${spawnCount}`);
  }
  console.log(`DUPLICATE_POST_NO_RESPAWN=true SPAWN_COUNT=${spawnCount}`);
  console.log("DOGFOOD_DURABLE_ATTEMPT_OK=true");

  await rm(journalDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
