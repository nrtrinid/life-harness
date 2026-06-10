import { describe, expect, it, vi } from "vitest";

import {
  evaluateSynthesisCompletion,
  formatDeepSynthesisError,
  runAskDeepSynthesisJob,
  type DeepSynthesisJobState
} from "./askDeepSynthesisJob";
import { DeepSynthesisError } from "./deepSynthesisClient";
import {
  AiJobFailedError,
  AiJobPollTimeoutError
} from "./aiJobClient";
import type { HarnessContext } from "./harnessContext";
import { parseDeepSynthesisCompletedResult } from "./deepSynthesisTypes";
import { sampleCompletedWireBody } from "./deepSynthesisTypes.test";
import type { AskThreadFingerprint } from "./askHarnessSynthesis";

const context: HarnessContext = {
  cards: [],
  logs: [],
  proof_items: [],
  recent_analyses: [],
  decisions: []
};

const requestFingerprint: AskThreadFingerprint = {
  threadLength: 2,
  lastItemId: "a1",
  lastItemRole: "assistant",
  lastUserMessageLength: 12,
  lastAssistantAnswerLength: 20,
  digestSnippet: ""
};

const baseRequest = {
  trigger: "thread_excerpt" as const,
  sensitivity: "S1" as const,
  userPrompt: "Synthesize this thread.",
  context,
  pipelineProfile: "with_critic" as const
};

function completedResult() {
  return parseDeepSynthesisCompletedResult(sampleCompletedWireBody());
}

describe("formatDeepSynthesisError", () => {
  it("maps S3 rejection to non-retryable copy", () => {
    const formatted = formatDeepSynthesisError(new DeepSynthesisError("S3 blocked", 422));
    expect(formatted.canRetry).toBe(false);
    expect(formatted.message).toContain("isn't included in synthesis");
  });

  it("maps poll timeout to retryable copy", () => {
    const formatted = formatDeepSynthesisError(new AiJobPollTimeoutError());
    expect(formatted.canRetry).toBe(true);
    expect(formatted.message).toContain("Still working");
  });
});

describe("evaluateSynthesisCompletion", () => {
  it("flags stale results when fingerprint changed", () => {
    const evaluation = evaluateSynthesisCompletion({
      result: completedResult(),
      requestFingerprint,
      currentFingerprint: { ...requestFingerprint, threadLength: 4 }
    });
    expect(evaluation.isStale).toBe(true);
  });
});

describe("runAskDeepSynthesisJob", () => {
  it("completes immediately when sync response is completed", async () => {
    const states: DeepSynthesisJobState[] = [];
    await runAskDeepSynthesisJob({
      baseUrl: "http://127.0.0.1:8111",
      request: baseRequest,
      requestFingerprint,
      getCurrentFingerprint: () => requestFingerprint,
      isCancelled: () => false,
      onStateChange: (state) => states.push(state),
      requestDeepSynthesisImpl: vi.fn().mockResolvedValue(completedResult())
    });

    expect(states.some((state) => state.status === "starting")).toBe(true);
    expect(states.at(-1)).toMatchObject({ status: "completed", isStale: false });
  });

  it("polls when sync response is queued", async () => {
    const pollMock = vi.fn().mockResolvedValue(completedResult());
    const states: DeepSynthesisJobState[] = [];

    await runAskDeepSynthesisJob({
      baseUrl: "http://127.0.0.1:8111",
      request: baseRequest,
      requestFingerprint,
      getCurrentFingerprint: () => requestFingerprint,
      isCancelled: () => false,
      onStateChange: (state) => states.push(state),
      requestDeepSynthesisImpl: vi.fn().mockResolvedValue({
        status: "queued",
        jobId: "job_1",
        pollUrl: "/ai/jobs/job_1",
        redirectReason: "critic_required"
      }),
      pollAiJobUntilDoneImpl: pollMock
    });

    expect(pollMock).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job_1", pollUrl: "/ai/jobs/job_1" })
    );
    expect(states.some((state) => state.status === "polling")).toBe(true);
    expect(states.at(-1)?.status).toBe("completed");
  });

  it("enters failed state on job failure", async () => {
    const states: DeepSynthesisJobState[] = [];
    await runAskDeepSynthesisJob({
      baseUrl: "http://127.0.0.1:8111",
      request: baseRequest,
      requestFingerprint,
      getCurrentFingerprint: () => requestFingerprint,
      isCancelled: () => false,
      onStateChange: (state) => states.push(state),
      requestDeepSynthesisImpl: vi.fn().mockRejectedValue(new AiJobFailedError("Verifier failed."))
    });

    expect(states.at(-1)).toMatchObject({
      status: "failed",
      message: "Verifier failed.",
      canRetry: true
    });
  });

  it("ignores late updates after cancellation", async () => {
    const states: DeepSynthesisJobState[] = [];
    let cancelled = false;

    await runAskDeepSynthesisJob({
      baseUrl: "http://127.0.0.1:8111",
      request: baseRequest,
      requestFingerprint,
      getCurrentFingerprint: () => requestFingerprint,
      isCancelled: () => cancelled,
      onStateChange: (state) => states.push(state),
      requestDeepSynthesisImpl: vi.fn().mockImplementation(async () => {
        cancelled = true;
        return completedResult();
      })
    });

    expect(states.some((state) => state.status === "completed")).toBe(false);
  });

  it("marks completed results stale when thread changed", async () => {
    const states: DeepSynthesisJobState[] = [];
    await runAskDeepSynthesisJob({
      baseUrl: "http://127.0.0.1:8111",
      request: baseRequest,
      requestFingerprint,
      getCurrentFingerprint: () => ({ ...requestFingerprint, threadLength: 5 }),
      isCancelled: () => false,
      onStateChange: (state) => states.push(state),
      requestDeepSynthesisImpl: vi.fn().mockResolvedValue(completedResult())
    });

    expect(states.at(-1)).toMatchObject({ status: "completed", isStale: true });
  });
});
