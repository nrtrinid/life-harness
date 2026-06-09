import { describe, expect, it, vi } from "vitest";

import {
  JOB_SCOUT_RUNNER_URL,
  RUNNER_UNREACHABLE_MESSAGE,
  RunnerUnreachableError,
  runSourceViaRunner,
  type RunSourceRequest
} from "./jobScoutRunnerClient";
import type { JobSource } from "./types";

const source: JobSource = {
  id: "source-test",
  name: "Test Source",
  url: "https://boards.example.com/jobs.json",
  kind: "greenhouse",
  enabled: true,
  cadence: "manual"
};

const request: RunSourceRequest = {
  source,
  existingCandidates: [],
  resumeModules: []
};

describe("jobScoutRunnerClient", () => {
  it("throws RunnerUnreachableError when runner is not running", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runSourceViaRunner(request)).rejects.toThrow(RunnerUnreachableError);
    await expect(runSourceViaRunner(request)).rejects.toThrow(RUNNER_UNREACHABLE_MESSAGE);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${JOB_SCOUT_RUNNER_URL}/run-source`);
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === source.url)).toBe(false);

    vi.unstubAllGlobals();
  });

  it("maps a successful runner response to JobSourceRunOutput", async () => {
    const runnerResponse = {
      result: {
        sourceId: source.id,
        fetchedAt: "2026-06-09T12:00:00.000Z",
        createdCandidateIds: ["candidate-1"],
        skippedDuplicates: 0,
        errors: [],
        message: "Found 1 new candidate."
      },
      candidates: [
        {
          id: "candidate-1",
          company: "Acme",
          roleTitle: "Engineer",
          description: "Python",
          roleType: "software",
          discoveredAt: "2026-06-09T12:00:00.000Z",
          origin: "source_fetch",
          status: "new",
          fitScore: 50,
          fitReasons: [],
          gaps: [],
          suggestedResumeModuleIds: [],
          nextTinyAction: "Review"
        }
      ],
      updatedSourcePatch: {
        runStatus: "success",
        lastFetchedCount: 1
      }
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => runnerResponse
      })
    );

    const output = await runSourceViaRunner(request);
    expect(output.candidates).toHaveLength(1);
    expect(output.result.createdCandidateIds).toEqual(["candidate-1"]);
    expect(output.updatedSource.lastFetchedCount).toBe(1);

    vi.unstubAllGlobals();
  });
});
