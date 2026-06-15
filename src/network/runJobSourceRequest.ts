import {
  RUNNER_UNREACHABLE_MESSAGE,
  RunnerUnreachableError,
  type RunSourceRequest
} from "../core/jobScoutRunnerClient";
import type { JobSourceRunOutput } from "../core/jobSourceRunner";
import { lifeHarnessApi } from "./lifeHarnessApi";
import { lifeHarnessNetworkStore } from "./store";

export function isRunnerUnreachableMutationError(error: unknown): boolean {
  if (error instanceof RunnerUnreachableError) {
    return true;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const nested =
      record.error && typeof record.error === "object"
        ? (record.error as Record<string, unknown>)
        : record;
    return nested.name === "RunnerUnreachableError";
  }

  return false;
}

export async function runJobSourceRequest(
  input: RunSourceRequest
): Promise<JobSourceRunOutput> {
  const result = await lifeHarnessNetworkStore.dispatch(
    lifeHarnessApi.endpoints.runJobSource.initiate(input)
  );

  if (result.error) {
    if (result.error.name === "RunnerUnreachableError") {
      throw new RunnerUnreachableError(result.error.message);
    }
    throw new Error(result.error.message ?? "Local Job Scout Runner request failed.");
  }

  if (!result.data) {
    throw new Error("Local Job Scout Runner request failed.");
  }

  return result.data;
}

export function runnerUnreachableMessage(error: unknown): string {
  return isRunnerUnreachableMutationError(error)
    ? RUNNER_UNREACHABLE_MESSAGE
    : "Local Job Scout Runner request failed.";
}
