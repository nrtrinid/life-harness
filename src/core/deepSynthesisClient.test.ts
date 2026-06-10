import { describe, expect, it, vi } from "vitest";

import { DEFAULT_CHAT_HARNESS_URL } from "./chatHarnessClient";
import type { HarnessContext } from "./harnessContext";
import {
  DeepSynthesisError,
  requestDeepSynthesis,
  requestDeepSynthesisJob,
  toWireDeepSynthesisRequest
} from "./deepSynthesisClient";
import type { SynthesisLens } from "./deepSynthesisTypes";
import { sampleCompletedWireBody } from "./deepSynthesisTypes.test";

const context: HarnessContext = {
  cards: [],
  logs: [],
  proof_items: [],
  recent_analyses: [],
  decisions: []
};

const baseInput = {
  trigger: "thread_excerpt" as const,
  sensitivity: "S1" as const,
  userPrompt: "Synthesize this thread.",
  context,
  pipelineProfile: "with_critic" as const,
  interpretationLenses: ["practical", "emotional", "product"] as SynthesisLens[]
};

describe("toWireDeepSynthesisRequest", () => {
  it("serializes snake_case request fields", () => {
    const wire = toWireDeepSynthesisRequest({
      ...baseInput,
      conversationHistory: [{ role: "user", content: "Hello" }],
      preferAsyncIfSlow: false
    });

    expect(wire.user_prompt).toBe("Synthesize this thread.");
    expect(wire.pipeline_profile).toBe("with_critic");
    expect(wire.conversation_history).toEqual([{ role: "user", content: "Hello" }]);
    expect(wire.prefer_async_if_slow).toBe(false);
    expect(wire.interpretation_lenses).toEqual(["practical", "emotional", "product"]);
  });
});

describe("requestDeepSynthesis", () => {
  it("handles completed flat response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(sampleCompletedWireBody())
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestDeepSynthesis({
      baseUrl: DEFAULT_CHAT_HARNESS_URL,
      ...baseInput,
      pipelineProfile: "fast_only"
    });

    expect(response.status).toBe("completed");
    if (response.status === "completed") {
      expect(response.synthesisId).toBe("syn_test_001");
    }

    vi.unstubAllGlobals();
  });

  it("handles queued redirect response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: "queued",
          job_id: "job_queued",
          poll_url: "/ai/jobs/job_queued",
          redirect_reason: "critic_required"
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestDeepSynthesis({
      baseUrl: DEFAULT_CHAT_HARNESS_URL,
      ...baseInput
    });

    expect(response.status).toBe("queued");
    if (response.status === "queued") {
      expect(response.jobId).toBe("job_queued");
    }

    vi.unstubAllGlobals();
  });

  it("normalizes base URL trailing slash", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(sampleCompletedWireBody())
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestDeepSynthesis({
      baseUrl: `${DEFAULT_CHAT_HARNESS_URL}/`,
      ...baseInput,
      pipelineProfile: "fast_only"
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${DEFAULT_CHAT_HARNESS_URL}/ai/deep-synthesis`);

    vi.unstubAllGlobals();
  });

  it("surfaces HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => JSON.stringify({ detail: "S3 content rejected." })
      })
    );

    await expect(
      requestDeepSynthesis({
        baseUrl: DEFAULT_CHAT_HARNESS_URL,
        ...baseInput
      })
    ).rejects.toMatchObject({
      message: "S3 content rejected.",
      status: 422
    } satisfies Partial<DeepSynthesisError>);

    vi.unstubAllGlobals();
  });
});

describe("requestDeepSynthesisJob", () => {
  it("posts to jobs endpoint and parses enqueue body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: "queued",
          job_id: "job_jobs",
          poll_url: "/ai/jobs/job_jobs",
          job_kind: "deep_synthesis",
          phase: "queued",
          created_at: "2026-06-10T12:00:00.000Z"
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestDeepSynthesisJob({
      baseUrl: DEFAULT_CHAT_HARNESS_URL,
      ...baseInput
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_CHAT_HARNESS_URL}/ai/deep-synthesis-jobs`);
    expect(init.method).toBe("POST");
    expect(response.jobId).toBe("job_jobs");
    expect(response.jobKind).toBe("deep_synthesis");

    vi.unstubAllGlobals();
  });
});
