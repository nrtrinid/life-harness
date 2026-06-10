import { describe, expect, it, vi } from "vitest";

import {
  AiJobCancelledError,
  AiJobFailedError,
  AiJobKindMismatchError,
  AiJobPollError,
  AiJobPollTimeoutError,
  getAiJob,
  pollAiJobUntilDone
} from "./aiJobClient";
import { sampleCompletedWireBody } from "./deepSynthesisTypes.test";

const BASE_URL = "http://127.0.0.1:8111";

function completedJobResponse() {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        job_id: "job_done",
        job_kind: "deep_synthesis",
        status: "completed",
        phase: "completed",
        created_at: "2026-06-10T12:00:00.000Z",
        completed_at: "2026-06-10T12:01:00.000Z",
        result: sampleCompletedWireBody({ status: undefined })
      })
  };
}

describe("getAiJob", () => {
  it("resolves relative poll URLs against baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completedJobResponse());
    const job = await getAiJob({
      baseUrl: BASE_URL,
      pollUrl: "/ai/jobs/job_done",
      fetchImpl: fetchMock
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/ai/jobs/job_done`);
    expect(job.status).toBe("completed");
  });

  it("rejects non-deep_synthesis job kinds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          job_id: "job_other",
          job_kind: "overnight_brain",
          status: "completed",
          created_at: "2026-06-10T12:00:00.000Z",
          result: sampleCompletedWireBody({ status: undefined })
        })
    });

    await expect(
      getAiJob({
        baseUrl: BASE_URL,
        jobId: "job_other",
        fetchImpl: fetchMock
      })
    ).rejects.toBeInstanceOf(AiJobKindMismatchError);
  });
});

describe("pollAiJobUntilDone", () => {
  it("polls until completed", async () => {
    let polls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      polls += 1;
      if (polls === 1) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              job_id: "job_done",
              job_kind: "deep_synthesis",
              status: "running",
              phase: "critic",
              created_at: "2026-06-10T12:00:00.000Z"
            })
        };
      }
      return completedJobResponse();
    });

    let nowMs = 0;
    const sleep = vi.fn(async () => {
      nowMs += 2000;
    });

    const result = await pollAiJobUntilDone({
      baseUrl: BASE_URL,
      jobId: "job_done",
      fetchImpl: fetchMock,
      now: () => nowMs,
      sleep,
      pollIntervalMs: 2000,
      maxDurationMs: 30_000
    });

    expect(result.status).toBe("completed");
    expect(result.synthesisId).toBe("syn_test_001");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("throws on failed job", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          job_id: "job_failed",
          job_kind: "deep_synthesis",
          status: "failed",
          created_at: "2026-06-10T12:00:00.000Z",
          error: "Verifier rejected draft."
        })
    });

    await expect(
      pollAiJobUntilDone({
        baseUrl: BASE_URL,
        jobId: "job_failed",
        fetchImpl: fetchMock,
        sleep: async () => undefined,
        now: () => 0,
        maxDurationMs: 5000
      })
    ).rejects.toBeInstanceOf(AiJobFailedError);
  });

  it("throws on cancelled job", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          job_id: "job_cancelled",
          job_kind: "deep_synthesis",
          status: "cancelled",
          created_at: "2026-06-10T12:00:00.000Z"
        })
    });

    await expect(
      pollAiJobUntilDone({
        baseUrl: BASE_URL,
        jobId: "job_cancelled",
        fetchImpl: fetchMock,
        sleep: async () => undefined,
        now: () => 0,
        maxDurationMs: 5000
      })
    ).rejects.toBeInstanceOf(AiJobCancelledError);
  });

  it("times out with fake sleep and clock", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          job_id: "job_slow",
          job_kind: "deep_synthesis",
          status: "running",
          phase: "draft",
          created_at: "2026-06-10T12:00:00.000Z"
        })
    });

    let nowMs = 0;
    const sleep = vi.fn(async () => {
      nowMs += 2000;
    });

    await expect(
      pollAiJobUntilDone({
        baseUrl: BASE_URL,
        jobId: "job_slow",
        fetchImpl: fetchMock,
        now: () => nowMs,
        sleep,
        pollIntervalMs: 2000,
        maxDurationMs: 4000
      })
    ).rejects.toBeInstanceOf(AiJobPollTimeoutError);
  });

  it("tolerates transient poll errors then succeeds", async () => {
    let polls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      polls += 1;
      if (polls === 1) {
        throw new TypeError("Failed to fetch");
      }
      return completedJobResponse();
    });

    const result = await pollAiJobUntilDone({
      baseUrl: BASE_URL,
      jobId: "job_done",
      fetchImpl: fetchMock,
      sleep: async () => undefined,
      now: () => 0,
      maxDurationMs: 10_000,
      maxConsecutivePollErrors: 3
    });

    expect(result.synthesisId).toBe("syn_test_001");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after max consecutive poll errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      pollAiJobUntilDone({
        baseUrl: BASE_URL,
        jobId: "job_unreachable",
        fetchImpl: fetchMock,
        sleep: async () => undefined,
        now: () => 0,
        maxDurationMs: 60_000,
        maxConsecutivePollErrors: 3
      })
    ).rejects.toBeInstanceOf(AiJobPollError);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects mismatched job kind during polling", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          job_id: "job_brain",
          job_kind: "overnight_brain",
          status: "completed",
          created_at: "2026-06-10T12:00:00.000Z",
          result: sampleCompletedWireBody({ status: undefined })
        })
    });

    await expect(
      pollAiJobUntilDone({
        baseUrl: BASE_URL,
        jobId: "job_brain",
        fetchImpl: fetchMock,
        sleep: async () => undefined,
        now: () => 0,
        maxDurationMs: 5000
      })
    ).rejects.toBeInstanceOf(AiJobKindMismatchError);
  });
});
