import type { JobCandidate, JobSource, ResumeModule } from "./types";
import type { JobSourceRunOutput } from "./jobSourceRunner";

export const JOB_SCOUT_RUNNER_URL = "http://127.0.0.1:8122";

export const RUNNER_UNREACHABLE_MESSAGE =
  "Local Job Scout Runner is not running. Start it with npm run scout:runner.";

export interface RunSourceRequest {
  source: JobSource;
  existingCandidates: JobCandidate[];
  resumeModules: ResumeModule[];
}

export interface RunSourceResponseBody {
  result: JobSourceRunOutput["result"];
  candidates: JobCandidate[];
  updatedSourcePatch: JobSourceRunOutput["updatedSource"];
}

export class RunnerUnreachableError extends Error {
  constructor(message = RUNNER_UNREACHABLE_MESSAGE) {
    super(message);
    this.name = "RunnerUnreachableError";
  }
}

export async function runSourceViaRunner(input: RunSourceRequest): Promise<JobSourceRunOutput> {
  try {
    const response = await fetch(`${JOB_SCOUT_RUNNER_URL}/run-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    if (response.status === 400) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? "Runner rejected the request.");
    }

    if (!response.ok) {
      throw new RunnerUnreachableError();
    }

    const body = (await response.json()) as RunSourceResponseBody;
    return {
      result: body.result,
      candidates: body.candidates,
      updatedSource: body.updatedSourcePatch
    };
  } catch (error) {
    if (error instanceof RunnerUnreachableError) {
      throw error;
    }
    throw new RunnerUnreachableError();
  }
}
