import type { JobCandidate, JobSource, ResumeModule } from "./types";
import type { JobSourceRunOutput } from "./jobSourceRunner";

export const JOB_SCOUT_RUNNER_URL = "http://127.0.0.1:8122";
export const JOB_SCOUT_LAUNCHER_URL = "http://127.0.0.1:8123";

export const RUNNER_START_COMMAND = "npm run scout:runner";

export const RUNNER_UNREACHABLE_MESSAGE =
  "Local Job Scout Runner is not running. Tap Start runner or run npm run scout:runner.";

export const LAUNCHER_UNREACHABLE_MESSAGE =
  "Dev launcher is not running. Use npm run web (starts launcher + app) or npm run scout:runner.";

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

export async function checkJobScoutRunnerHealth(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(`${JOB_SCOUT_RUNNER_URL}/health`);
    if (!response.ok) {
      return { ok: false, message: RUNNER_UNREACHABLE_MESSAGE };
    }
    return { ok: true, message: "Runner awake on 127.0.0.1:8122." };
  } catch {
    return { ok: false, message: RUNNER_UNREACHABLE_MESSAGE };
  }
}

export async function requestJobScoutRunnerStart(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(`${JOB_SCOUT_LAUNCHER_URL}/start`, { method: "POST" });
    const body = (await response.json()) as { ok?: boolean; message?: string };
    return {
      ok: Boolean(body.ok),
      message: body.message ?? (body.ok ? "Runner started." : LAUNCHER_UNREACHABLE_MESSAGE)
    };
  } catch {
    return { ok: false, message: LAUNCHER_UNREACHABLE_MESSAGE };
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
