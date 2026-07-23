import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FeatureSprintRunnerRequest, FeatureSprintRunnerResponse } from "../../../src/core/featureSprintRunner";
import {
  clearAttemptJournalInFlightForTests,
  getAttemptStatusFromJournal,
  readAttemptJournalRecord,
  runFeatureSprintPacketWithAttemptJournal,
  writeAttemptJournalRecord
} from "../src/attemptJournal";

const binding = {
  planId: "plan-1",
  actionId: "action-1",
  stateRevision: 2,
  profile: "codex_implementation" as const,
  cardId: "card-1",
  stepId: "step-1",
  taskId: "task-1",
  phase: "implement"
};

function baseRequest(attemptId: string): FeatureSprintRunnerRequest {
  return {
    profile: "codex_implementation",
    promptMarkdown: "Implement the tiny slice.",
    planId: "plan-1",
    stepId: "step-1",
    repoPath: path.join(os.tmpdir(), "unused-repo"),
    worktree: { enabled: true },
    attemptId,
    attemptBinding: binding
  };
}

function okResult(runId: string): FeatureSprintRunnerResponse {
  return {
    ok: true,
    profile: "codex_implementation",
    outputText: `result-for-${runId}`,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    runId,
    resultUsability: "usable"
  };
}

describe("attemptJournal", () => {
  let journalDir = "";

  beforeEach(async () => {
    clearAttemptJournalInFlightForTests();
    journalDir = await mkdtemp(path.join(os.tmpdir(), "fs-attempt-journal-"));
  });

  afterEach(async () => {
    clearAttemptJournalInFlightForTests();
    await rm(journalDir, { recursive: true, force: true });
  });

  it("spawns once for an attemptId and replays completed results", async () => {
    const runOnce = vi.fn(async () => okResult("spawned-1"));
    const first = await runFeatureSprintPacketWithAttemptJournal(baseRequest("attempt-1"), {
      journalDir,
      runOnce
    });
    expect("conflict" in first).toBe(false);
    if ("conflict" in first) {
      return;
    }
    expect(first.ok).toBe(true);
    expect(runOnce).toHaveBeenCalledTimes(1);

    const second = await runFeatureSprintPacketWithAttemptJournal(baseRequest("attempt-1"), {
      journalDir,
      runOnce
    });
    expect("conflict" in second).toBe(false);
    if ("conflict" in second) {
      return;
    }
    expect(second.outputText).toBe(first.outputText);
    expect(runOnce).toHaveBeenCalledTimes(1);

    const status = await getAttemptStatusFromJournal("attempt-1", journalDir);
    expect(status.status).toBe("completed");
    expect(status.result?.outputText).toBe(first.outputText);
    expect(status.providerSpawned).toBe(true);
  });

  it("rejects mismatched identity without spawning or overwriting", async () => {
    const runOnce = vi.fn(async () => okResult("spawned-1"));
    await runFeatureSprintPacketWithAttemptJournal(baseRequest("attempt-2"), {
      journalDir,
      runOnce
    });
    expect(runOnce).toHaveBeenCalledTimes(1);

    const conflict = await runFeatureSprintPacketWithAttemptJournal(
      {
        ...baseRequest("attempt-2"),
        attemptBinding: { ...binding, stateRevision: 99 }
      },
      { journalDir, runOnce }
    );
    expect("conflict" in conflict).toBe(true);
    if (!("conflict" in conflict)) {
      return;
    }
    expect(conflict.conflict.status).toBe("identity_conflict");
    expect(runOnce).toHaveBeenCalledTimes(1);

    const original = await readAttemptJournalRecord("attempt-2", journalDir);
    expect(original?.identity.stateRevision).toBe(2);
  });

  it("does not respawn an interrupted running record after process restart simulation", async () => {
    await writeAttemptJournalRecord(
      {
        attemptId: "attempt-3",
        runId: "run-interrupted",
        identity: binding,
        status: "running",
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        providerSpawned: true,
        requestSummary: {
          profile: "codex_implementation",
          planId: "plan-1",
          promptChars: 10
        }
      },
      journalDir
    );

    const runOnce = vi.fn(async () => okResult("should-not-run"));
    const result = await runFeatureSprintPacketWithAttemptJournal(baseRequest("attempt-3"), {
      journalDir,
      runOnce
    });
    expect(runOnce).not.toHaveBeenCalled();
    expect("conflict" in result).toBe(false);
    if ("conflict" in result) {
      return;
    }
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not respawned/i);

    const status = await getAttemptStatusFromJournal("attempt-3", journalDir);
    expect(status.status).toBe("interrupted");
    expect(status.providerSpawned).toBe(true);
  });

  it("reloads completed journal entries after clearing in-flight (restart)", async () => {
    const runOnce = vi.fn(async () => okResult("spawned-restart"));
    await runFeatureSprintPacketWithAttemptJournal(baseRequest("attempt-4"), {
      journalDir,
      runOnce
    });
    clearAttemptJournalInFlightForTests();

    const status = await getAttemptStatusFromJournal("attempt-4", journalDir);
    expect(status.status).toBe("completed");
    expect(status.result?.outputText).toContain("spawned-restart");

    const replay = await runFeatureSprintPacketWithAttemptJournal(baseRequest("attempt-4"), {
      journalDir,
      runOnce
    });
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect("conflict" in replay).toBe(false);
    if ("conflict" in replay) {
      return;
    }
    expect(replay.outputText).toContain("spawned-restart");
  });

  it("joins concurrent cold claims so provider spawns once", async () => {
    let active = 0;
    let maxActive = 0;
    const runOnce = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active -= 1;
      return okResult("spawned-concurrent");
    });

    const [a, b] = await Promise.all([
      runFeatureSprintPacketWithAttemptJournal(baseRequest("attempt-concurrent"), {
        journalDir,
        runOnce
      }),
      runFeatureSprintPacketWithAttemptJournal(baseRequest("attempt-concurrent"), {
        journalDir,
        runOnce
      })
    ]);

    expect("conflict" in a).toBe(false);
    expect("conflict" in b).toBe(false);
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(maxActive).toBe(1);
  });
});
