import { afterEach, describe, expect, it, vi } from "vitest";

import { RUNNER_UNREACHABLE_MESSAGE, RunnerUnreachableError } from "../core/jobScoutRunnerClient";
import type { JobSource } from "../core/types";
import {
  isRunnerUnreachableMutationError,
  runJobSourceRequest,
  runnerUnreachableMessage
} from "./runJobSourceRequest";

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

describe("runJobSourceRequest", () => {
  it("delegates to the RTK Query endpoint and returns runner output", async () => {
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

    const output = await runJobSourceRequest({
      source,
      existingCandidates: [],
      resumeModules: []
    });

    expect(output.result.createdCandidateIds).toEqual(["candidate-1"]);
  });

  it("rethrows RunnerUnreachableError from endpoint failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(
      runJobSourceRequest({
        source,
        existingCandidates: [],
        resumeModules: []
      })
    ).rejects.toBeInstanceOf(RunnerUnreachableError);
  });
});

describe("isRunnerUnreachableMutationError", () => {
  it("detects direct and RTK-shaped runner unreachable errors", () => {
    expect(isRunnerUnreachableMutationError(new RunnerUnreachableError())).toBe(true);
    expect(
      isRunnerUnreachableMutationError({
        error: { name: "RunnerUnreachableError", message: RUNNER_UNREACHABLE_MESSAGE }
      })
    ).toBe(true);
    expect(isRunnerUnreachableMutationError(new Error("other"))).toBe(false);
  });

  it("maps runner unreachable messages for batch handlers", () => {
    expect(runnerUnreachableMessage(new RunnerUnreachableError())).toBe(RUNNER_UNREACHABLE_MESSAGE);
    expect(runnerUnreachableMessage(new Error("other"))).toBe(
      "Local Job Scout Runner request failed."
    );
  });
});
