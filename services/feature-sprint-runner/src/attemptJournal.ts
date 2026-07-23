/**
 * File-backed Feature Sprint attempt journal.
 * Survives runner process restart. Does not respawn interrupted running attempts.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX,
  type FeatureSprintAttemptJournalStatus,
  type FeatureSprintAttemptStatusResponse,
  type FeatureSprintRunnerAttemptBinding,
  type FeatureSprintRunnerRequest,
  type FeatureSprintRunnerResponse
} from "../../../src/core/featureSprintRunner";
import { redactSecrets } from "./redact";

export const FEATURE_SPRINT_ATTEMPT_JOURNAL_RESULT_TEXT_MAX = 50_000;

export type FeatureSprintAttemptJournalRecord = {
  attemptId: string;
  runId: string;
  identity: FeatureSprintRunnerAttemptBinding;
  status: "claimed" | "running" | "completed" | "failed" | "interrupted";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  providerSpawned: boolean;
  result?: FeatureSprintRunnerResponse;
  failureMessage?: string;
  requestSummary: {
    profile: string;
    planId?: string;
    stepId?: string;
    cardId?: string;
    promptChars: number;
  };
};

const inFlightByAttemptId = new Map<
  string,
  {
    binding: FeatureSprintRunnerAttemptBinding;
    promise: Promise<FeatureSprintRunnerResponse | { conflict: FeatureSprintAttemptStatusResponse }>;
  }
>();

/** Same-process recovery when the completed journal file write fails after a successful run. */
const inProcessCompletedByAttemptId = new Map<
  string,
  {
    binding: FeatureSprintRunnerAttemptBinding;
    result: FeatureSprintRunnerResponse;
    providerSpawned: boolean;
  }
>();

export const FEATURE_SPRINT_ATTEMPT_JOURNAL_WRITE_RETRIES = 3;

export function resolveAttemptJournalDir(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.FEATURE_SPRINT_ATTEMPT_JOURNAL_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(os.tmpdir(), "life-harness-feature-sprint-attempt-journal");
}

function safeAttemptFileName(attemptId: string): string {
  return `${attemptId.replace(/[^A-Za-z0-9._:-]/g, "_")}.json`;
}

function journalPathFor(attemptId: string, journalDir: string): string {
  return path.join(journalDir, safeAttemptFileName(attemptId));
}

function nowIso(): string {
  return new Date().toISOString();
}

function capText(value: string | undefined, max: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactSecrets(value);
  return redacted.length > max ? redacted.slice(0, max) : redacted;
}

export function capJournalResult(
  result: FeatureSprintRunnerResponse
): FeatureSprintRunnerResponse {
  return {
    ...result,
    outputText: capText(result.outputText, FEATURE_SPRINT_ATTEMPT_JOURNAL_RESULT_TEXT_MAX),
    stdoutText: capText(result.stdoutText, FEATURE_SPRINT_ATTEMPT_JOURNAL_RESULT_TEXT_MAX),
    stderrText: capText(result.stderrText, FEATURE_SPRINT_ATTEMPT_JOURNAL_RESULT_TEXT_MAX),
    diagnosticMessage: capText(result.diagnosticMessage, 4_000),
    error: capText(result.error, 4_000),
    gitStatus: capText(result.gitStatus, 8_000),
    diffStat: capText(result.diffStat, 8_000),
    diffText: capText(result.diffText, FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX),
    // Never persist host filesystem paths into the durable journal.
    stdoutPath: undefined,
    worktreePath: undefined
  };
}

export function bindingsEqual(
  a: FeatureSprintRunnerAttemptBinding,
  b: FeatureSprintRunnerAttemptBinding
): boolean {
  return (
    a.planId === b.planId &&
    a.actionId === b.actionId &&
    a.stateRevision === b.stateRevision &&
    a.profile === b.profile &&
    (a.cardId ?? "") === (b.cardId ?? "") &&
    (a.stepId ?? "") === (b.stepId ?? "") &&
    (a.taskId ?? "") === (b.taskId ?? "") &&
    (a.phase ?? "") === (b.phase ?? "") &&
    (a.clarifiedSpecRevision ?? null) === (b.clarifiedSpecRevision ?? null)
  );
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, filePath);
}

export async function readAttemptJournalRecord(
  attemptId: string,
  journalDir = resolveAttemptJournalDir()
): Promise<FeatureSprintAttemptJournalRecord | null> {
  const filePath = journalPathFor(attemptId, journalDir);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as FeatureSprintAttemptJournalRecord;
    if (!parsed || typeof parsed !== "object" || parsed.attemptId !== attemptId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeAttemptJournalRecord(
  record: FeatureSprintAttemptJournalRecord,
  journalDir = resolveAttemptJournalDir()
): Promise<void> {
  await atomicWriteJson(journalPathFor(record.attemptId, journalDir), record);
}

/**
 * On runner process start, previously `running` records that already spawned become `interrupted`.
 * Claimed / pre-spawn records may continue exactly once. Never respawn after providerSpawned.
 */
export async function classifyInterruptedRunningRecord(
  record: FeatureSprintAttemptJournalRecord,
  journalDir = resolveAttemptJournalDir()
): Promise<FeatureSprintAttemptJournalRecord> {
  if (inFlightByAttemptId.has(record.attemptId)) {
    return record;
  }
  if (record.status === "running" && record.providerSpawned) {
    const next: FeatureSprintAttemptJournalRecord = {
      ...record,
      status: "interrupted",
      completedAt: record.completedAt ?? nowIso(),
      failureMessage:
        record.failureMessage ??
        "Attempt was running when the runner process restarted; provider was not respawned."
    };
    await writeAttemptJournalRecord(next, journalDir);
    return next;
  }
  return record;
}

export function journalRecordToStatusResponse(
  record: FeatureSprintAttemptJournalRecord
): FeatureSprintAttemptStatusResponse {
  const status: FeatureSprintAttemptJournalStatus =
    record.status === "completed"
      ? "completed"
      : record.status === "failed"
        ? "failed"
        : record.status === "interrupted"
          ? "interrupted"
          : record.status === "running"
            ? "running"
            : "claimed";

  return {
    ok: true,
    attemptId: record.attemptId,
    status,
    runId: record.runId,
    result: record.result,
    error: record.failureMessage,
    providerSpawned: record.providerSpawned
  };
}

function buildRequestSummary(request: FeatureSprintRunnerRequest) {
  return {
    profile: request.profile,
    planId: request.planId,
    stepId: request.stepId,
    cardId: request.cardId,
    promptChars: request.promptMarkdown.length
  };
}

export type RunWithAttemptJournalOptions = {
  journalDir?: string;
  runOnce: (request: FeatureSprintRunnerRequest) => Promise<FeatureSprintRunnerResponse>;
  /** Test seam: override journal write (e.g. fail N times then succeed). */
  writeRecord?: (
    record: FeatureSprintAttemptJournalRecord,
    journalDir: string
  ) => Promise<void>;
  journalWriteRetries?: number;
};

/**
 * Claim-before-spawn + replay for durable attemptId requests.
 * Requests without attemptId bypass the journal (legacy path).
 *
 * Concurrent same-attemptId callers join one in-process promise registered
 * synchronously before any await (prevents cold-claim double-spawn).
 * Mismatched bindings while in-flight fail closed with identity_conflict.
 */
export async function runFeatureSprintPacketWithAttemptJournal(
  request: FeatureSprintRunnerRequest,
  options: RunWithAttemptJournalOptions
): Promise<FeatureSprintRunnerResponse | { conflict: FeatureSprintAttemptStatusResponse }> {
  if (!request.attemptId || !request.attemptBinding) {
    return options.runOnce(request);
  }

  const attemptId = request.attemptId;
  const journalDir = options.journalDir ?? resolveAttemptJournalDir();
  const writeRecord = options.writeRecord ?? writeAttemptJournalRecord;
  const journalWriteRetries =
    options.journalWriteRetries ?? FEATURE_SPRINT_ATTEMPT_JOURNAL_WRITE_RETRIES;

  const existingInFlight = inFlightByAttemptId.get(attemptId);
  if (existingInFlight) {
    if (!bindingsEqual(existingInFlight.binding, request.attemptBinding)) {
      return {
        conflict: {
          ok: false,
          attemptId,
          status: "identity_conflict",
          identityConflict: true,
          error: "attemptId is already bound to a different request identity.",
          providerSpawned: true
        }
      };
    }
    return existingInFlight.promise;
  }

  const inProcessCompleted = inProcessCompletedByAttemptId.get(attemptId);
  if (inProcessCompleted) {
    if (!bindingsEqual(inProcessCompleted.binding, request.attemptBinding)) {
      return {
        conflict: {
          ok: false,
          attemptId,
          status: "identity_conflict",
          identityConflict: true,
          error: "attemptId is already bound to a different request identity.",
          providerSpawned: inProcessCompleted.providerSpawned
        }
      };
    }
    return inProcessCompleted.result;
  }

  const work = (async (): Promise<
    FeatureSprintRunnerResponse | { conflict: FeatureSprintAttemptStatusResponse }
  > => {
    const existing = await readAttemptJournalRecord(attemptId, journalDir);
    if (existing) {
      if (!bindingsEqual(existing.identity, request.attemptBinding!)) {
        return {
          conflict: {
            ok: false,
            attemptId,
            status: "identity_conflict",
            identityConflict: true,
            runId: existing.runId,
            error: "attemptId is already bound to a different request identity.",
            providerSpawned: existing.providerSpawned
          }
        };
      }

      const classified = await classifyInterruptedRunningRecord(existing, journalDir);
      if (classified.status === "completed" || classified.status === "failed") {
        if (!classified.result) {
          return {
            conflict: {
              ok: false,
              attemptId,
              status: classified.status,
              runId: classified.runId,
              error: classified.failureMessage ?? "Journal entry is missing a result.",
              providerSpawned: classified.providerSpawned
            }
          };
        }
        return classified.result;
      }

      if (classified.status === "interrupted") {
        return (
          classified.result ??
          ({
            ok: false,
            profile: request.profile,
            error:
              classified.failureMessage ??
              "Attempt interrupted by runner restart; provider was not respawned.",
            startedAt: classified.startedAt ?? classified.createdAt,
            completedAt: classified.completedAt ?? nowIso(),
            runId: classified.runId,
            failureClass: "runner",
            terminationReason: "runner_error",
            resultUsability: "unusable",
            executionContext: request.executionContext
          } satisfies FeatureSprintRunnerResponse)
        );
      }

      if (classified.providerSpawned) {
        return (
          classified.result ??
          ({
            ok: false,
            profile: request.profile,
            error: "Attempt is already running; provider was not respawned.",
            startedAt: classified.startedAt ?? classified.createdAt,
            completedAt: nowIso(),
            runId: classified.runId,
            failureClass: "runner",
            terminationReason: "runner_error",
            resultUsability: "unusable",
            executionContext: request.executionContext
          } satisfies FeatureSprintRunnerResponse)
        );
      }

      return spawnAndPersist(request, {
        journalDir,
        runOnce: options.runOnce,
        writeRecord,
        journalWriteRetries,
        runId: classified.runId,
        createdAt: classified.createdAt,
        baseRecord: {
          ...classified,
          status: "running",
          startedAt: classified.startedAt ?? nowIso(),
          providerSpawned: true
        }
      });
    }

    const runId = randomUUID();
    const createdAt = nowIso();
    const claimed: FeatureSprintAttemptJournalRecord = {
      attemptId,
      runId,
      identity: request.attemptBinding!,
      status: "claimed",
      createdAt,
      providerSpawned: false,
      requestSummary: buildRequestSummary(request)
    };
    // Persist claim BEFORE provider spawn.
    await writeRecord(claimed, journalDir);

    return spawnAndPersist(request, {
      journalDir,
      runOnce: options.runOnce,
      writeRecord,
      journalWriteRetries,
      runId,
      createdAt,
      baseRecord: {
        ...claimed,
        status: "running",
        startedAt: nowIso(),
        providerSpawned: true
      }
    });
  })();

  // Register before any await yields — concurrent callers join this promise.
  inFlightByAttemptId.set(attemptId, {
    binding: request.attemptBinding,
    promise: work
  });

  try {
    return await work;
  } finally {
    inFlightByAttemptId.delete(attemptId);
  }
}

async function writeJournalWithRetries(
  record: FeatureSprintAttemptJournalRecord,
  journalDir: string,
  writeRecord: (
    record: FeatureSprintAttemptJournalRecord,
    journalDir: string
  ) => Promise<void>,
  retries: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  let lastError = "Journal write failed.";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await writeRecord(record, journalDir);
      return { ok: true };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Journal write failed.";
      console.warn(
        `[feature-sprint-runner] attempt journal write failed attemptId=${record.attemptId} try=${attempt}/${retries}: ${lastError}`
      );
    }
  }
  return { ok: false, error: lastError };
}

async function spawnAndPersist(
  request: FeatureSprintRunnerRequest,
  args: {
    journalDir: string;
    runOnce: (request: FeatureSprintRunnerRequest) => Promise<FeatureSprintRunnerResponse>;
    writeRecord: (
      record: FeatureSprintAttemptJournalRecord,
      journalDir: string
    ) => Promise<void>;
    journalWriteRetries: number;
    runId: string;
    createdAt: string;
    baseRecord: FeatureSprintAttemptJournalRecord;
  }
): Promise<FeatureSprintRunnerResponse> {
  await args.writeRecord(args.baseRecord, args.journalDir);

  let result: FeatureSprintRunnerResponse;
  try {
    result = await args.runOnce(request);
  } catch (error) {
    result = {
      ok: false,
      profile: request.profile,
      error: error instanceof Error ? error.message : "Runner execution failed.",
      startedAt: args.createdAt,
      completedAt: nowIso(),
      runId: args.runId,
      failureClass: "runner",
      terminationReason: "runner_error",
      resultUsability: "unusable",
      executionContext: request.executionContext
    };
  }

  const capped = capJournalResult({
    ...result,
    runId: result.runId ?? args.runId,
    journalDurability: "durable"
  });
  const completed: FeatureSprintAttemptJournalRecord = {
    ...args.baseRecord,
    status: capped.ok ? "completed" : "failed",
    completedAt: capped.completedAt || nowIso(),
    result: capped,
    failureMessage: capped.ok ? undefined : capped.error ?? capped.diagnosticMessage,
    providerSpawned: true
  };

  const persisted = await writeJournalWithRetries(
    completed,
    args.journalDir,
    args.writeRecord,
    args.journalWriteRetries
  );

  if (!persisted.ok) {
    const degraded: FeatureSprintRunnerResponse = {
      ...capped,
      journalDurability: "degraded_in_process_only",
      parseWarnings: [
        ...(capped.parseWarnings ?? []),
        "Runner journal completed-record write failed after provider execution; result is preserved in-process only and may not survive runner restart."
      ],
      diagnosticMessage:
        capped.diagnosticMessage ??
        "Provider finished, but the durable attempt journal could not be updated."
    };
    inProcessCompletedByAttemptId.set(request.attemptId!, {
      binding: request.attemptBinding!,
      result: degraded,
      providerSpawned: true
    });
    console.warn(
      `[feature-sprint-runner] completed journal durability degraded attemptId=${request.attemptId} runId=${args.runId}`
    );
    return degraded;
  }

  inProcessCompletedByAttemptId.set(request.attemptId!, {
    binding: request.attemptBinding!,
    result: capped,
    providerSpawned: true
  });
  return capped;
}

export async function getAttemptStatusFromJournal(
  attemptId: string,
  journalDir = resolveAttemptJournalDir()
): Promise<FeatureSprintAttemptStatusResponse> {
  const trimmed = attemptId.trim();
  if (!trimmed) {
    return {
      ok: false,
      attemptId,
      status: "unknown",
      error: "attemptId is required."
    };
  }

  const inProcess = inProcessCompletedByAttemptId.get(trimmed);
  if (inProcess) {
    return {
      ok: true,
      attemptId: trimmed,
      status: inProcess.result.ok ? "completed" : "failed",
      runId: inProcess.result.runId,
      result: inProcess.result,
      providerSpawned: inProcess.providerSpawned,
      error:
        inProcess.result.journalDurability === "degraded_in_process_only"
          ? "Result preserved in-process; journal file durability was degraded."
          : undefined
    };
  }

  const existing = await readAttemptJournalRecord(trimmed, journalDir);
  if (!existing) {
    return {
      ok: false,
      attemptId: trimmed,
      status: "unknown",
      error: "Unknown attemptId."
    };
  }

  const classified = await classifyInterruptedRunningRecord(existing, journalDir);
  return journalRecordToStatusResponse(classified);
}

/** Test helper — clear in-process in-flight map. */
export function clearAttemptJournalInFlightForTests(): void {
  inFlightByAttemptId.clear();
  inProcessCompletedByAttemptId.clear();
}
