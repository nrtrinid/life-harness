import type { CompanionSelfMemory } from "./companionSelfMemory";
import { DEFAULT_RAW_LAB_MAX_INPUT_CHARS } from "./gatewayBudget";
import {
  buildRawLabSendBundle,
  isRawLabInputBudgetError,
  type RawLabCompactionNotice,
  type RawLabSendBundle
} from "./rawLabContextBudget";
import {
  createEmptyRawLabThreadState,
  toWireThreadState,
  toWireTurns,
  type RawLabSmartCompactedContext,
  type RawLabThreadState,
  type RawLabTurn,
  type RawLabWireThreadState,
  type RawLabWireTurn
} from "./rawLabThreadState";

export const DEFAULT_RAW_LAB_URL = "http://127.0.0.1:8111";

export type { RawLabRole, RawLabThreadState, RawLabTurn } from "./rawLabThreadState";
export type { RawLabCompactionNotice } from "./rawLabContextBudget";

export type RawLabReasoningDepth = "fast" | "deliberate" | "deep";

export interface RawLabResponse {
  answer: string;
  mode: "raw_lab";
  safety_notes: string[];
  used_context: false;
}

export type RawLabSendResult = {
  response: RawLabResponse;
  notice?: RawLabCompactionNotice;
  sendStats?: {
    estimatedChars: number;
    level: RawLabSendBundle["level"];
    turnsSent: number;
    memoriesSent: number;
    budgetCapChars: number;
    injectedMemoryIds: string[];
    smartCompactedContext: RawLabSmartCompactedContext;
  };
};

export class RawLabError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "RawLabError";
    this.status = status;
  }
}

export interface AskRawLabInput {
  baseUrl: string;
  message: string;
  turns?: RawLabTurn[];
  threadState?: RawLabThreadState;
  companionSelfMemories?: CompanionSelfMemory[];
  reasoningDepth?: RawLabReasoningDepth;
  signal?: AbortSignal;
  maxInputChars?: number;
}

export interface RawLabRequestBody {
  message: string;
  recent_turns: RawLabWireTurn[];
  thread_state: RawLabWireThreadState;
  companion_self_memories: Array<{
    id: string;
    kind: string;
    subject: string;
    scope: string;
    text: string;
    confidence: number;
    sensitivity: string;
  }>;
  reasoning_depth: RawLabReasoningDepth;
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

function isBrowserFetchFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }
  const lowered = error.message.toLowerCase();
  return (
    lowered.includes("failed to fetch") ||
    lowered.includes("networkerror") ||
    lowered.includes("load failed") ||
    lowered.includes("network request failed")
  );
}

export function rawLabFetchFailureMessage(baseUrl: string, error: unknown): string {
  if (isBrowserFetchFailure(error)) {
    return `Browser could not complete the request to ${baseUrl}. Enable dev CORS on ai-gateway (SCOUT_DEV_CORS, default on) or confirm the gateway is running.`;
  }
  if (error instanceof Error && error.message.trim()) {
    return `Could not reach Raw Lab at ${baseUrl}: ${error.message}`;
  }
  return `Local ai-gateway is not reachable at ${baseUrl}.`;
}

export function bundleToRequestBody(
  bundle: RawLabSendBundle,
  reasoningDepth: RawLabReasoningDepth = "fast"
): RawLabRequestBody {
  return {
    message: bundle.message,
    recent_turns: toWireTurns(bundle.recentTurns),
    thread_state: toWireThreadState(bundle.threadState),
    companion_self_memories: bundle.companionSelfMemories,
    reasoning_depth: reasoningDepth
  };
}

export function buildRawLabRequestBody(args: {
  message: string;
  turns: RawLabTurn[];
  threadState: RawLabThreadState;
  companionSelfMemories?: CompanionSelfMemory[];
  reasoningDepth?: RawLabReasoningDepth;
  maxInputChars?: number;
}): RawLabRequestBody {
  const bundle = buildRawLabSendBundle({
    message: args.message,
    turns: args.turns,
    threadState: args.threadState,
    companionSelfMemories: args.companionSelfMemories,
    maxInputChars: args.maxInputChars
  });
  return bundleToRequestBody(bundle, args.reasoningDepth ?? "fast");
}

export function parseRawLabResponse(payload: unknown): RawLabResponse {
  if (!payload || typeof payload !== "object") {
    throw new RawLabError("Unexpected response from ai-gateway.");
  }

  const data = payload as Record<string, unknown>;

  if (typeof data.answer !== "string") {
    throw new RawLabError("Unexpected response from ai-gateway.");
  }
  if (data.mode !== "raw_lab") {
    throw new RawLabError("Unexpected response from ai-gateway.");
  }
  if (data.used_context !== false) {
    throw new RawLabError("Unexpected response from ai-gateway.");
  }
  if (!Array.isArray(data.safety_notes)) {
    throw new RawLabError("Unexpected response from ai-gateway.");
  }

  return {
    answer: data.answer,
    mode: "raw_lab",
    safety_notes: data.safety_notes.filter((note): note is string => typeof note === "string"),
    used_context: false
  };
}

async function postRawLabJson(args: {
  baseUrl: string;
  path: string;
  body: RawLabRequestBody;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; status: number; text: string }> {
  const url = `${args.baseUrl}${args.path}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args.body),
      signal: args.signal
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    if (args.signal?.aborted) {
      throw new RawLabError("Raw Lab stream stopped.");
    }
    throw new RawLabError(rawLabFetchFailureMessage(args.baseUrl, error));
  }
}

function sendStatsFromBundle(
  bundle: RawLabSendBundle,
  budgetCapChars: number
): RawLabSendResult["sendStats"] {
  return {
    estimatedChars: bundle.estimatedChars,
    level: bundle.level,
    turnsSent: bundle.recentTurns.length,
    memoriesSent: bundle.companionSelfMemories.length,
    budgetCapChars,
    injectedMemoryIds: bundle.companionSelfMemories.map((memory) => memory.id),
    smartCompactedContext: bundle.smartCompactedContext
  };
}

async function postRawLabWithBudget(args: {
  baseUrl: string;
  path: string;
  message: string;
  turns: RawLabTurn[];
  threadState: RawLabThreadState;
  companionSelfMemories?: CompanionSelfMemory[];
  reasoningDepth?: RawLabReasoningDepth;
  signal?: AbortSignal;
  maxInputChars?: number;
}): Promise<RawLabSendResult> {
  const budgetCapChars = args.maxInputChars ?? DEFAULT_RAW_LAB_MAX_INPUT_CHARS;
  let bundle = buildRawLabSendBundle({
    message: args.message,
    turns: args.turns,
    threadState: args.threadState,
    companionSelfMemories: args.companionSelfMemories,
    maxInputChars: budgetCapChars
  });

  const reasoningDepth = args.reasoningDepth ?? "fast";
  let body = bundleToRequestBody(bundle, reasoningDepth);
  let result = await postRawLabJson({
    baseUrl: args.baseUrl,
    path: args.path,
    body,
    signal: args.signal
  });

  if (!result.ok) {
    const detail = parseErrorDetail(result.text);
    const canRetry =
      result.status === 422 &&
      isRawLabInputBudgetError(detail) &&
      bundle.level !== "aggressive";

    if (canRetry) {
      bundle = buildRawLabSendBundle({
        message: args.message,
        turns: args.turns,
        threadState: args.threadState,
        companionSelfMemories: args.companionSelfMemories,
        maxInputChars: args.maxInputChars,
        forceAggressive: true
      });
      body = bundleToRequestBody(bundle, reasoningDepth);
      result = await postRawLabJson({
        baseUrl: args.baseUrl,
        path: args.path,
        body,
        signal: args.signal
      });
    }

    if (!result.ok) {
      throw new RawLabError(detail ?? `Raw Lab request failed (${result.status}).`, result.status);
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(result.text);
  } catch {
    throw new RawLabError("Unexpected response from ai-gateway.");
  }

  return {
    response: parseRawLabResponse(payload),
    notice: bundle.notice,
    sendStats: sendStatsFromBundle(bundle, budgetCapChars)
  };
}

export async function askRawLab(input: AskRawLabInput): Promise<RawLabSendResult> {
  const message = input.message.trim();
  if (!message) {
    throw new RawLabError("Message must not be empty.");
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  return postRawLabWithBudget({
    baseUrl,
    path: "/raw-lab",
    message,
    turns: input.turns ?? [],
    threadState: input.threadState ?? createEmptyRawLabThreadState(),
    companionSelfMemories: input.companionSelfMemories,
    reasoningDepth: input.reasoningDepth,
    signal: input.signal,
    maxInputChars: input.maxInputChars
  });
}

function parseStreamEvent(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(5).trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function streamRawLab(
  input: AskRawLabInput & {
    onChunk: (chunk: string) => void;
  }
): Promise<RawLabSendResult> {
  const message = input.message.trim();
  if (!message) {
    throw new RawLabError("Message must not be empty.");
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const turns = input.turns ?? [];
  const threadState = input.threadState ?? createEmptyRawLabThreadState();
  const companionSelfMemories = input.companionSelfMemories;
  const budgetCapChars = input.maxInputChars ?? DEFAULT_RAW_LAB_MAX_INPUT_CHARS;

  let bundle = buildRawLabSendBundle({
    message,
    turns,
    threadState,
    companionSelfMemories,
    maxInputChars: budgetCapChars
  });
  const reasoningDepth = input.reasoningDepth ?? "fast";
  let body = bundleToRequestBody(bundle, reasoningDepth);

  async function runStream(requestBody: RawLabRequestBody): Promise<RawLabSendResult | null> {
    const url = `${baseUrl}/raw-lab/stream`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: input.signal
      });
    } catch (error) {
      if (input.signal?.aborted) {
        throw new RawLabError("Raw Lab stream stopped.");
      }
      return null;
    }

    if (!response.ok || !response.body) {
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalPayload: RawLabResponse | null = null;
    let streamError: RawLabError | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (input.signal?.aborted) {
        await reader.cancel();
        throw new RawLabError("Raw Lab stream stopped.");
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseStreamEvent(line);
        if (!event) {
          continue;
        }
        if (typeof event.chunk === "string" && event.chunk.length > 0) {
          input.onChunk(event.chunk);
        }
        if (event.done === true) {
          finalPayload = parseRawLabResponse(event);
        }
        if (typeof event.error === "string") {
          streamError = new RawLabError(
            event.error,
            typeof event.status === "number" ? event.status : undefined
          );
        }
      }
    }

    if (streamError) {
      throw streamError;
    }
    if (finalPayload) {
      return {
        response: finalPayload,
        notice: bundle.notice,
        sendStats: sendStatsFromBundle(bundle, budgetCapChars)
      };
    }
    return null;
  }

  try {
    const streamed = await runStream(body);
    if (streamed) {
      return streamed;
    }
  } catch (error) {
    if (
      error instanceof RawLabError &&
      error.status === 422 &&
      isRawLabInputBudgetError(error.message) &&
      bundle.level !== "aggressive"
    ) {
      bundle = buildRawLabSendBundle({
        message,
        turns,
        threadState,
        companionSelfMemories,
        maxInputChars: input.maxInputChars,
        forceAggressive: true
      });
      body = bundleToRequestBody(bundle, reasoningDepth);
      const retried = await runStream(body);
      if (retried) {
        return retried;
      }
    } else {
      throw error;
    }
  }

  return askRawLab(input);
}
