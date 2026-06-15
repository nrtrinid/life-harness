import {
  AiJobCancelledError,
  AiJobFailedError,
  AiJobKindMismatchError,
  AiJobPollError,
  pollAiJobUntilDone,
  type GetAiJobInput,
  type PollAiJobUntilDoneOptions
} from "../core/aiJobClient";
import {
  DeepSynthesisError,
  type RequestDeepSynthesisInput
} from "../core/deepSynthesisClient";
import type {
  AiJobStatusResponse,
  DeepSynthesisCompletedResult,
  DeepSynthesisPostResponse
} from "../core/deepSynthesisTypes";
import { lifeHarnessApi } from "./lifeHarnessApi";
import type { LifeHarnessNetworkError } from "./lifeHarnessApi";
import { lifeHarnessNetworkStore } from "./store";

function rethrowAiJobPollError(error: LifeHarnessNetworkError): never {
  const message = error.message || "Job poll failed.";
  if (error.name === "AiJobKindMismatchError") {
    const match = message.match(/Unexpected job kind: ([^.]+)\./);
    throw new AiJobKindMismatchError(match?.[1] ?? "unknown");
  }
  if (error.name === "AiJobFailedError") {
    throw new AiJobFailedError(message, message);
  }
  if (error.name === "AiJobCancelledError") {
    throw new AiJobCancelledError(message);
  }
  throw new AiJobPollError(message);
}

export async function requestDeepSynthesisThroughNetwork(
  input: RequestDeepSynthesisInput
): Promise<DeepSynthesisPostResponse> {
  const result = await lifeHarnessNetworkStore.dispatch(
    lifeHarnessApi.endpoints.requestDeepSynthesis.initiate(input)
  );

  if (result.error) {
    const error = result.error as LifeHarnessNetworkError;
    throw new DeepSynthesisError(
      error.message ?? "Deep synthesis request failed.",
      error.status
    );
  }

  if (!result.data) {
    throw new DeepSynthesisError("Deep synthesis request failed.");
  }

  return result.data;
}

export async function getAiJobThroughNetwork(
  input: GetAiJobInput
): Promise<AiJobStatusResponse> {
  const result = await lifeHarnessNetworkStore.dispatch(
    lifeHarnessApi.endpoints.getAiJob.initiate(
      {
        baseUrl: input.baseUrl,
        pollUrl: input.pollUrl,
        jobId: input.jobId,
        fetchImpl: input.fetchImpl
      },
      { forceRefetch: true }
    )
  );

  if (result.error) {
    rethrowAiJobPollError(result.error as LifeHarnessNetworkError);
  }

  if (!result.data) {
    throw new AiJobPollError("Job poll failed.");
  }

  return result.data;
}

export function pollAiJobThroughNetwork(
  options: PollAiJobUntilDoneOptions
): Promise<DeepSynthesisCompletedResult> {
  return pollAiJobUntilDone({
    ...options,
    getAiJobImpl: getAiJobThroughNetwork
  });
}
