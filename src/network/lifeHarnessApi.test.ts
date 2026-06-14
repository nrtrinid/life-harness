import { afterEach, describe, expect, it, vi } from "vitest";

import { lifeHarnessApi } from "./lifeHarnessApi";
import { createLifeHarnessNetworkStore } from "./store";
import { JOB_SCOUT_RUNNER_URL, type RunSourceRequest } from "../core/jobScoutRunnerClient";
import type { JobSource } from "../core/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

const source: JobSource = {
  id: "source-test",
  name: "Test Source",
  url: "https://boards.example.com/jobs.json",
  kind: "greenhouse",
  enabled: true,
  cadence: "manual"
};

const runSourceRequest: RunSourceRequest = {
  source,
  existingCandidates: [],
  resumeModules: []
};

describe("lifeHarnessApi", () => {
  it("registers a network-only RTK Query reducer", () => {
    const store = createLifeHarnessNetworkStore();

    expect(store.getState()).toHaveProperty(lifeHarnessApi.reducerPath);
    expect(lifeHarnessApi.reducerPath).toBe("lifeHarnessApi");
  });

  it("delegates gateway health budget queries to the existing client", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          budget: {
            max_input_chars: 18_000,
            raw_lab_max_input_chars: 32_000,
            timeout_seconds: 180
          }
        })
      })
    );

    const store = createLifeHarnessNetworkStore();
    const result = await store.dispatch(
      lifeHarnessApi.endpoints.getGatewayHealthBudget.initiate("http://127.0.0.1:8111")
    );

    expect(result.data).toEqual({
      maxInputChars: 18_000,
      rawLabMaxInputChars: 32_000,
      timeoutSeconds: 180
    });
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8111/health");
  });

  it("delegates Job Scout source runs to the runner client", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            sourceId: source.id,
            fetchedAt: "2026-06-14T09:00:00.000Z",
            createdCandidateIds: ["candidate-1"],
            skippedDuplicates: 0,
            errors: [],
            message: "Found 1 new candidate."
          },
          candidates: [],
          updatedSourcePatch: {
            runStatus: "success",
            lastFetchedCount: 1
          }
        })
      })
    );

    const store = createLifeHarnessNetworkStore();
    const result = await store.dispatch(
      lifeHarnessApi.endpoints.runJobSource.initiate(runSourceRequest)
    );

    expect(result.data?.result.createdCandidateIds).toEqual(["candidate-1"]);
    expect(fetch).toHaveBeenCalledWith(
      `${JOB_SCOUT_RUNNER_URL}/run-source`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(runSourceRequest)
      })
    );
  });

  it("returns compact serialized errors from endpoint queryFns", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const store = createLifeHarnessNetworkStore();
    const result = await store.dispatch(
      lifeHarnessApi.endpoints.runJobSource.initiate(runSourceRequest)
    );

    expect(result.error).toEqual(
      expect.objectContaining({
        message: "Local Job Scout Runner is not running. Tap Start runner or run npm run scout:runner.",
        name: "RunnerUnreachableError"
      })
    );
  });
});
