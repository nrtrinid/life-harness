import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import {
  askChatHarness,
  type AskChatHarnessInput
} from "../core/chatHarnessClient";
import type { ChatHarnessResponse } from "../core/harnessContext";
import {
  requestDeepSynthesis,
  requestDeepSynthesisJob,
  type RequestDeepSynthesisInput
} from "../core/deepSynthesisClient";
import type {
  DeepSynthesisJobEnqueue,
  DeepSynthesisPostResponse
} from "../core/deepSynthesisTypes";
import {
  getAiJob,
  type GetAiJobInput
} from "../core/aiJobClient";
import type { AiJobStatusResponse } from "../core/deepSynthesisTypes";
import {
  checkJobScoutRunnerHealth,
  requestJobScoutRunnerStart,
  runSourceViaRunner,
  type RunSourceRequest
} from "../core/jobScoutRunnerClient";
import type { JobSourceRunOutput } from "../core/jobSourceRunner";
import {
  fetchGatewayHealthBudget,
  type GatewayHealthBudget
} from "../core/gatewayHealthClient";
import {
  askRawLab,
  type AskRawLabInput,
  type RawLabSendResult
} from "../core/rawLabClient";
import {
  reflectOnRawLab,
  type RawLabSelfReflectionResponse,
  type ReflectOnRawLabInput
} from "../core/rawLabSelfReflectionClient";
import {
  reflectRawLabThread,
  type RawLabThreadReflectionResponse,
  type ReflectRawLabThreadInput
} from "../core/rawLabThreadReflectionClient";

export type LifeHarnessNetworkError = {
  message: string;
  name?: string;
  status?: number;
};

function toNetworkError(error: unknown): LifeHarnessNetworkError {
  if (error instanceof Error) {
    const status = (error as { status?: unknown }).status;
    return {
      message: error.message,
      name: error.name,
      status: typeof status === "number" ? status : undefined
    };
  }
  return { message: "Network request failed." };
}

async function queryFrom<T>(run: () => Promise<T>): Promise<
  { data: T } | { error: LifeHarnessNetworkError }
> {
  try {
    return { data: await run() };
  } catch (error) {
    return { error: toNetworkError(error) };
  }
}

export const lifeHarnessApi = createApi({
  reducerPath: "lifeHarnessApi",
  baseQuery: fakeBaseQuery<LifeHarnessNetworkError>(),
  tagTypes: ["GatewayHealth", "JobScoutRunner", "AiJob"],
  endpoints: (builder) => ({
    getGatewayHealthBudget: builder.query<GatewayHealthBudget, string>({
      queryFn: (baseUrl) => queryFrom(() => fetchGatewayHealthBudget(baseUrl)),
      providesTags: ["GatewayHealth"]
    }),
    checkJobScoutRunnerHealth: builder.query<{ ok: boolean; message: string }, void>({
      queryFn: () => queryFrom(checkJobScoutRunnerHealth),
      providesTags: ["JobScoutRunner"]
    }),
    startJobScoutRunner: builder.mutation<{ ok: boolean; message: string }, void>({
      queryFn: () => queryFrom(requestJobScoutRunnerStart),
      invalidatesTags: ["JobScoutRunner"]
    }),
    runJobSource: builder.mutation<JobSourceRunOutput, RunSourceRequest>({
      queryFn: (input) => queryFrom(() => runSourceViaRunner(input))
    }),
    askChatHarness: builder.mutation<ChatHarnessResponse, AskChatHarnessInput>({
      queryFn: (input) => queryFrom(() => askChatHarness(input))
    }),
    requestDeepSynthesis: builder.mutation<
      DeepSynthesisPostResponse,
      RequestDeepSynthesisInput
    >({
      queryFn: (input) => queryFrom(() => requestDeepSynthesis(input))
    }),
    requestDeepSynthesisJob: builder.mutation<
      DeepSynthesisJobEnqueue,
      RequestDeepSynthesisInput
    >({
      queryFn: (input) => queryFrom(() => requestDeepSynthesisJob(input))
    }),
    getAiJob: builder.query<AiJobStatusResponse, GetAiJobInput>({
      queryFn: (input) => queryFrom(() => getAiJob(input)),
      providesTags: (_result, _error, input) => [
        { type: "AiJob", id: input.jobId ?? input.pollUrl ?? "unknown" }
      ]
    }),
    askRawLab: builder.mutation<RawLabSendResult, AskRawLabInput>({
      queryFn: (input) => queryFrom(() => askRawLab(input))
    }),
    reflectOnRawLab: builder.mutation<
      RawLabSelfReflectionResponse,
      ReflectOnRawLabInput
    >({
      queryFn: (input) => queryFrom(() => reflectOnRawLab(input))
    }),
    reflectRawLabThread: builder.mutation<
      RawLabThreadReflectionResponse,
      ReflectRawLabThreadInput
    >({
      queryFn: (input) => queryFrom(() => reflectRawLabThread(input))
    })
  })
});

export const {
  useGetGatewayHealthBudgetQuery,
  useCheckJobScoutRunnerHealthQuery,
  useStartJobScoutRunnerMutation,
  useRunJobSourceMutation,
  useAskChatHarnessMutation,
  useRequestDeepSynthesisMutation,
  useRequestDeepSynthesisJobMutation,
  useGetAiJobQuery,
  useLazyGetAiJobQuery,
  useAskRawLabMutation,
  useReflectOnRawLabMutation,
  useReflectRawLabThreadMutation
} = lifeHarnessApi;
