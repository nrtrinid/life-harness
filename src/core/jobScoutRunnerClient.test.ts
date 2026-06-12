import { describe, expect, it, vi } from "vitest";

import {
  checkJobScoutRunnerHealth,
  JOB_SCOUT_LAUNCHER_URL,
  JOB_SCOUT_RUNNER_URL,
  LAUNCHER_UNREACHABLE_MESSAGE,
  RUNNER_UNREACHABLE_MESSAGE,
  RunnerUnreachableError,
  requestJobScoutRunnerStart,
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
  it("checks runner health via /health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200
      })
    );

    const healthy = await checkJobScoutRunnerHealth();
    expect(healthy.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`${JOB_SCOUT_RUNNER_URL}/health`);

    vi.unstubAllGlobals();
  });

  it("reports runner down when health check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const unhealthy = await checkJobScoutRunnerHealth();
    expect(unhealthy.ok).toBe(false);
    expect(unhealthy.message).toBe(RUNNER_UNREACHABLE_MESSAGE);

    vi.unstubAllGlobals();
  });

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

  it("requests runner start from the dev launcher", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, message: "Job Scout Runner started on 127.0.0.1:8122." })
      })
    );

    const result = await requestJobScoutRunnerStart();
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`${JOB_SCOUT_LAUNCHER_URL}/start`, { method: "POST" });

    vi.unstubAllGlobals();
  });

  it("returns launcher unreachable when dev launcher is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const result = await requestJobScoutRunnerStart();
    expect(result.ok).toBe(false);
    expect(result.message).toBe(LAUNCHER_UNREACHABLE_MESSAGE);

    vi.unstubAllGlobals();
  });
});
