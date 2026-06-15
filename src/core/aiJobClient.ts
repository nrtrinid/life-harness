import type { DeepSynthesisCompletedResult } from "./deepSynthesisTypes";
import { parseAiJobStatusResponse } from "./deepSynthesisTypes";
import type { AiJobStatusResponse } from "./deepSynthesisTypes";

export const POLL_INTERVAL_MS = 2000;
export const POLL_MAX_DURATION_MS = 300_000;
export const POLL_BACKOFF_AFTER_MS = 60_000;
export const POLL_BACKOFF_INTERVAL_MS = 4000;
export const MAX_CONSECUTIVE_POLL_ERRORS = 3;

export class AiJobPollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiJobPollError";
  }
}

export class AiJobPollTimeoutError extends AiJobPollError {
  constructor(message = "Synthesis job poll timed out.") {
    super(message);
    this.name = "AiJobPollTimeoutError";
  }
}

export class AiJobFailedError extends AiJobPollError {
  errorDetail?: string;

  constructor(message = "Synthesis job failed.", errorDetail?: string) {
    super(message);
    this.name = "AiJobFailedError";
    this.errorDetail = errorDetail;
  }
}

export class AiJobCancelledError extends AiJobPollError {
  constructor(message = "Synthesis job was cancelled.") {
    super(message);
    this.name = "AiJobCancelledError";
  }
}

export class AiJobKindMismatchError extends AiJobPollError {
  jobKind: string;

  constructor(jobKind: string) {
    super(`Unexpected job kind: ${jobKind}. Expected deep_synthesis.`);
    this.name = "AiJobKindMismatchError";
    this.jobKind = jobKind;
  }
}

export interface GetAiJobInput {
  baseUrl: string;
  pollUrl?: string;
  jobId?: string;
  fetchImpl?: typeof fetch;
}

export interface PollAiJobUntilDoneOptions extends GetAiJobInput {
  getAiJobImpl?: typeof getAiJob;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxDurationMs?: number;
  backoffAfterMs?: number;
  maxConsecutivePollErrors?: number;
  onPollUpdate?: (job: AiJobStatusResponse) => void;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

function resolvePollUrl(input: GetAiJobInput): string {
  if (input.pollUrl?.trim()) {
    const pollUrl = input.pollUrl.trim();
    if (pollUrl.startsWith("http://") || pollUrl.startsWith("https://")) {
      return pollUrl;
    }
    return `${normalizeBaseUrl(input.baseUrl)}${pollUrl.startsWith("/") ? pollUrl : `/${pollUrl}`}`;
  }
  if (input.jobId?.trim()) {
    return `${normalizeBaseUrl(input.baseUrl)}/ai/jobs/${input.jobId.trim()}`;
  }
  throw new AiJobPollError("pollUrl or jobId is required.");
}

function assertDeepSynthesisJobKind(job: AiJobStatusResponse): void {
  if (job.jobKind !== "deep_synthesis") {
    throw new AiJobKindMismatchError(job.jobKind);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function getAiJob(input: GetAiJobInput): Promise<AiJobStatusResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = resolvePollUrl(input);

  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not reach ai-gateway job endpoint.";
    throw new AiJobPollError(message);
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new AiJobPollError(
      response.status === 404
        ? "Synthesis job expired or was not found."
        : `Job poll failed (${response.status}).`
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new AiJobPollError("Unexpected job poll response from ai-gateway.");
  }

  const job = parseAiJobStatusResponse(payload);
  assertDeepSynthesisJobKind(job);
  return job;
}

function pollIntervalForElapsed(
  elapsedMs: number,
  pollIntervalMs: number,
  backoffAfterMs: number
): number {
  return elapsedMs >= backoffAfterMs ? POLL_BACKOFF_INTERVAL_MS : pollIntervalMs;
}

export async function pollAiJobUntilDone(
  options: PollAiJobUntilDoneOptions
): Promise<DeepSynthesisCompletedResult> {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const maxDurationMs = options.maxDurationMs ?? POLL_MAX_DURATION_MS;
  const backoffAfterMs = options.backoffAfterMs ?? POLL_BACKOFF_AFTER_MS;
  const maxConsecutivePollErrors =
    options.maxConsecutivePollErrors ?? MAX_CONSECUTIVE_POLL_ERRORS;
  const getAiJobFn = options.getAiJobImpl ?? getAiJob;

  const startedAt = now();
  let consecutivePollErrors = 0;

  while (true) {
    const elapsedMs = now() - startedAt;
    if (elapsedMs >= maxDurationMs) {
      throw new AiJobPollTimeoutError();
    }

    let job: AiJobStatusResponse;
    try {
      job = await getAiJobFn(options);
      consecutivePollErrors = 0;
    } catch (error) {
      if (
        error instanceof AiJobKindMismatchError ||
        error instanceof AiJobFailedError ||
        error instanceof AiJobCancelledError
      ) {
        throw error;
      }

      consecutivePollErrors += 1;
      if (consecutivePollErrors >= maxConsecutivePollErrors) {
        const message =
          error instanceof Error ? error.message : "Job poll failed repeatedly.";
        throw new AiJobPollError(message);
      }

      await sleep(pollIntervalForElapsed(elapsedMs, pollIntervalMs, backoffAfterMs));
      continue;
    }

    if (job.status === "completed") {
      if (!job.result) {
        throw new AiJobPollError("Completed job missing result.");
      }
      return {
        status: "completed",
        ...job.result
      };
    }

    if (job.status === "failed") {
      throw new AiJobFailedError(
        job.error ?? "Couldn't finish synthesis — your thread is safe.",
        job.error
      );
    }

    if (job.status === "cancelled") {
      throw new AiJobCancelledError();
    }

    options.onPollUpdate?.(job);

    await sleep(pollIntervalForElapsed(elapsedMs, pollIntervalMs, backoffAfterMs));
  }
}
