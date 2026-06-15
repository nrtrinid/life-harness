import {
  AiJobCancelledError,
  AiJobFailedError,
  AiJobPollError,
  AiJobPollTimeoutError,
  pollAiJobUntilDone
} from "./aiJobClient";
import { DeepSynthesisError } from "./deepSynthesisClient";
import {
  pollAiJobThroughNetwork,
  requestDeepSynthesisThroughNetwork
} from "../network/deepSynthesisRequest";
import type { DeepSynthesisCompletedResult } from "./deepSynthesisTypes";
import {
  isSynthesisResultStale,
  type AskThreadFingerprint
} from "./askHarnessSynthesis";
import type { DeepSynthesisRequestInput } from "./deepSynthesisTypes";

export type DeepSynthesisJobStatus = "idle" | "starting" | "polling" | "completed" | "failed";

export type DeepSynthesisJobState =
  | { status: "idle" }
  | {
      status: "starting";
      requestFingerprint: AskThreadFingerprint;
      startedAt: number;
    }
  | {
      status: "polling";
      requestFingerprint: AskThreadFingerprint;
      jobId: string;
      pollUrl: string;
      phase?: string;
      startedAt: number;
    }
  | {
      status: "completed";
      requestFingerprint: AskThreadFingerprint;
      result: DeepSynthesisCompletedResult;
      isStale: boolean;
      startedAt: number;
    }
  | {
      status: "failed";
      message: string;
      canRetry: boolean;
      startedAt: number;
    };

export type RunAskDeepSynthesisInput = {
  baseUrl: string;
  request: DeepSynthesisRequestInput;
  requestFingerprint: AskThreadFingerprint;
  getCurrentFingerprint: () => AskThreadFingerprint;
  isCancelled: () => boolean;
  onStateChange: (state: DeepSynthesisJobState) => void;
  requestDeepSynthesisImpl?: typeof requestDeepSynthesisThroughNetwork;
  pollAiJobUntilDoneImpl?: typeof pollAiJobThroughNetwork;
};

export function formatDeepSynthesisError(error: unknown): { message: string; canRetry: boolean } {
  if (error instanceof DeepSynthesisError) {
    if (error.status === 422) {
      return {
        message:
          "That content isn't included in synthesis — try a narrower prompt or lower sensitivity.",
        canRetry: false
      };
    }
    return { message: error.message, canRetry: true };
  }

  if (error instanceof AiJobPollTimeoutError) {
    return {
      message: "Still working on the gateway — check back or retry.",
      canRetry: true
    };
  }

  if (error instanceof AiJobFailedError) {
    return {
      message: error.message,
      canRetry: true
    };
  }

  if (error instanceof AiJobCancelledError) {
    return {
      message: "Synthesis was cancelled.",
      canRetry: true
    };
  }

  if (error instanceof AiJobPollError) {
    return { message: error.message, canRetry: true };
  }

  if (error instanceof Error && error.message.trim()) {
    return { message: error.message, canRetry: true };
  }

  return {
    message: "Couldn't finish synthesis — your thread is safe.",
    canRetry: true
  };
}

export function evaluateSynthesisCompletion(args: {
  result: DeepSynthesisCompletedResult;
  requestFingerprint: AskThreadFingerprint;
  currentFingerprint: AskThreadFingerprint;
}): { result: DeepSynthesisCompletedResult; isStale: boolean } {
  return {
    result: args.result,
    isStale: isSynthesisResultStale(args.currentFingerprint, args.requestFingerprint)
  };
}

export async function runAskDeepSynthesisJob(input: RunAskDeepSynthesisInput): Promise<void> {
  const requestDeepSynthesisFn =
    input.requestDeepSynthesisImpl ?? requestDeepSynthesisThroughNetwork;
  const pollAiJobUntilDoneFn = input.pollAiJobUntilDoneImpl ?? pollAiJobThroughNetwork;
  const startedAt = Date.now();
  const requestFingerprint = input.requestFingerprint;

  input.onStateChange({ status: "starting", requestFingerprint, startedAt });

  try {
    const response = await requestDeepSynthesisFn({
      baseUrl: input.baseUrl,
      ...input.request
    });

    if (input.isCancelled()) {
      return;
    }

    if (response.status === "completed") {
      const currentFingerprint = input.getCurrentFingerprint();
      const { result, isStale } = evaluateSynthesisCompletion({
        result: response,
        requestFingerprint,
        currentFingerprint
      });
      if (input.isCancelled()) {
        return;
      }
      input.onStateChange({
        status: "completed",
        requestFingerprint,
        result,
        isStale,
        startedAt
      });
      return;
    }

    input.onStateChange({
      status: "polling",
      requestFingerprint,
      jobId: response.jobId,
      pollUrl: response.pollUrl,
      startedAt
    });

    const result = await pollAiJobUntilDoneFn({
      baseUrl: input.baseUrl,
      jobId: response.jobId,
      pollUrl: response.pollUrl,
      onPollUpdate: (job) => {
        if (input.isCancelled()) {
          return;
        }
        input.onStateChange({
          status: "polling",
          requestFingerprint,
          jobId: response.jobId,
          pollUrl: response.pollUrl,
          phase: job.phase,
          startedAt
        });
      }
    });

    if (input.isCancelled()) {
      return;
    }

    const currentFingerprint = input.getCurrentFingerprint();
    const completion = evaluateSynthesisCompletion({
      result,
      requestFingerprint,
      currentFingerprint
    });

    if (input.isCancelled()) {
      return;
    }

    input.onStateChange({
      status: "completed",
      requestFingerprint,
      result: completion.result,
      isStale: completion.isStale,
      startedAt
    });
  } catch (error) {
    if (input.isCancelled()) {
      return;
    }
    const formatted = formatDeepSynthesisError(error);
    input.onStateChange({
      status: "failed",
      message: formatted.message,
      canRetry: formatted.canRetry,
      startedAt
    });
  }
}