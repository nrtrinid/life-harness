import { chatHarnessFetchFailureMessage } from "./chatHarnessClient";
import type {
  DeepSynthesisJobEnqueue,
  DeepSynthesisPostResponse,
  DeepSynthesisRequestInput
} from "./deepSynthesisTypes";
import {
  parseDeepSynthesisJobEnqueue,
  parseDeepSynthesisPostResponse
} from "./deepSynthesisTypes";

export class DeepSynthesisError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "DeepSynthesisError";
    this.status = status;
  }
}

export interface RequestDeepSynthesisInput extends DeepSynthesisRequestInput {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

function parseErrorDetail(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { detail?: string | { msg?: string }[] };
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
      return parsed.detail[0].msg;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function toWireDeepSynthesisRequest(
  input: DeepSynthesisRequestInput
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    trigger: input.trigger,
    sensitivity: input.sensitivity,
    user_prompt: input.userPrompt,
    context: input.context,
    conversation_history: input.conversationHistory ?? [],
    pipeline_profile: input.pipelineProfile ?? "fast_only",
    prefer_async_if_slow: input.preferAsyncIfSlow ?? true
  };

  if (input.contextPacket) {
    body.context_packet = input.contextPacket;
  }
  if (input.threadState) {
    body.thread_state = input.threadState;
  }
  if (input.interpretationLenses && input.interpretationLenses.length > 0) {
    body.interpretation_lenses = input.interpretationLenses;
  }

  return body;
}

async function postDeepSynthesis(
  path: "/ai/deep-synthesis" | "/ai/deep-synthesis-jobs",
  input: RequestDeepSynthesisInput
): Promise<Response> {
  const userPrompt = input.userPrompt.trim();
  if (!userPrompt) {
    throw new DeepSynthesisError("user_prompt must not be empty.");
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = `${baseUrl}${path}`;
  const body = toWireDeepSynthesisRequest({ ...input, userPrompt });

  try {
    return await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new DeepSynthesisError(chatHarnessFetchFailureMessage(baseUrl, error));
  }
}

async function readJsonResponse(
  response: Response,
  baseUrl: string
): Promise<unknown> {
  const responseText = await response.text();

  if (!response.ok) {
    const detail = parseErrorDetail(responseText);
    throw new DeepSynthesisError(
      detail ?? `Deep synthesis request failed (${response.status}).`,
      response.status
    );
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new DeepSynthesisError("Unexpected response from ai-gateway.");
  }
}

export async function requestDeepSynthesis(
  input: RequestDeepSynthesisInput
): Promise<DeepSynthesisPostResponse> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const response = await postDeepSynthesis("/ai/deep-synthesis", input);
  const payload = await readJsonResponse(response, baseUrl);

  try {
    return parseDeepSynthesisPostResponse(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected response from ai-gateway.";
    throw new DeepSynthesisError(message);
  }
}

export async function requestDeepSynthesisJob(
  input: RequestDeepSynthesisInput
): Promise<DeepSynthesisJobEnqueue> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const response = await postDeepSynthesis("/ai/deep-synthesis-jobs", input);
  const payload = await readJsonResponse(response, baseUrl);

  try {
    return parseDeepSynthesisJobEnqueue(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected response from ai-gateway.";
    throw new DeepSynthesisError(message);
  }
}
