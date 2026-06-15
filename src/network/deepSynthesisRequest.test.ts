import { afterEach, describe, expect, it, vi } from "vitest";

import { AiJobPollError } from "../core/aiJobClient";
import { DeepSynthesisError } from "../core/deepSynthesisClient";
import type { HarnessContext } from "../core/harnessContext";
import { sampleCompletedWireBody } from "../core/deepSynthesisTypes.test";
import {
  getAiJobThroughNetwork,
  pollAiJobThroughNetwork,
  requestDeepSynthesisThroughNetwork
} from "./deepSynthesisRequest";
import { lifeHarnessApi } from "./lifeHarnessApi";
import { lifeHarnessNetworkStore } from "./store";

afterEach(() => {
  vi.unstubAllGlobals();
  lifeHarnessNetworkStore.dispatch(lifeHarnessApi.util.resetApiState());
});

const context: HarnessContext = {
  cards: [],
  logs: [],
  proof_items: [],
  recent_analyses: [],
  decisions: []
};

describe("deepSynthesisRequest", () => {
  it("delegates deep synthesis requests to the RTK Query endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(sampleCompletedWireBody())
      })
    );

    const response = await requestDeepSynthesisThroughNetwork({
      baseUrl: "http://127.0.0.1:8111",
      trigger: "thread_excerpt",
      sensitivity: "S1",
      userPrompt: "Synthesize this thread.",
      context,
      pipelineProfile: "with_critic"
    });

    expect(response.status).toBe("completed");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8111/ai/deep-synthesis",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws DeepSynthesisError when the endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => JSON.stringify({ detail: "S3 blocked" })
      })
    );

    await expect(
      requestDeepSynthesisThroughNetwork({
        baseUrl: "http://127.0.0.1:8111",
        trigger: "thread_excerpt",
        sensitivity: "S3",
        userPrompt: "Synthesize this thread.",
        context,
        pipelineProfile: "with_critic"
      })
    ).rejects.toBeInstanceOf(DeepSynthesisError);
  });

  it("delegates job polls to the RTK Query endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            job_id: "job_get",
            job_kind: "deep_synthesis",
            status: "completed",
            phase: "completed",
            created_at: "2026-06-10T12:00:00.000Z",
            completed_at: "2026-06-10T12:01:00.000Z",
            result: sampleCompletedWireBody({ status: undefined })
          })
      })
    );

    const job = await getAiJobThroughNetwork({
      baseUrl: "http://127.0.0.1:8111",
      jobId: "job_get"
    });

    expect(job.status).toBe("completed");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8111/ai/jobs/job_get",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("polls queued jobs through the network getAiJob path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            job_id: "job_poll",
            job_kind: "deep_synthesis",
            status: "running",
            phase: "drafting",
            created_at: "2026-06-10T12:00:00.000Z"
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            job_id: "job_poll",
            job_kind: "deep_synthesis",
            status: "completed",
            phase: "completed",
            created_at: "2026-06-10T12:00:00.000Z",
            completed_at: "2026-06-10T12:01:00.000Z",
            result: sampleCompletedWireBody({ status: undefined })
          })
      });
    vi.stubGlobal("fetch", fetchMock);

    let nowMs = 0;
    const result = await pollAiJobThroughNetwork({
      baseUrl: "http://127.0.0.1:8111",
      jobId: "job_poll",
      now: () => nowMs,
      sleep: async (ms) => {
        nowMs += ms;
      },
      pollIntervalMs: 2000,
      maxDurationMs: 30_000
    });

    expect(result.status).toBe("completed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rethrows AiJobPollError from failed job polls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(
      getAiJobThroughNetwork({
        baseUrl: "http://127.0.0.1:8111",
        jobId: "job_fail"
      })
    ).rejects.toBeInstanceOf(AiJobPollError);
  });
});
