import {
  buildRawLabConversationPayload,
  createEmptyRawLabThreadState,
  type RawLabThreadState,
  type RawLabTurn,
  type RawLabWireThreadState,
  type RawLabWireTurn
} from "./rawLabThreadState";

export const DEFAULT_RAW_LAB_URL = "http://127.0.0.1:8111";

export type { RawLabRole, RawLabThreadState, RawLabTurn } from "./rawLabThreadState";

export interface RawLabResponse {
  answer: string;
  mode: "raw_lab";
  safety_notes: string[];
  used_context: false;
}

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
}

export interface RawLabRequestBody {
  message: string;
  recent_turns: RawLabWireTurn[];
  thread_state: RawLabWireThreadState;
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

export function buildRawLabRequestBody(args: {
  message: string;
  turns: RawLabTurn[];
  threadState: RawLabThreadState;
}): RawLabRequestBody {
  const message = args.message.trim();
  const { recent_turns, thread_state } = buildRawLabConversationPayload({
    turns: args.turns,
    threadState: args.threadState,
    latestMessage: message
  });

  return {
    message,
    recent_turns,
    thread_state
  };
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

export async function askRawLab(input: AskRawLabInput): Promise<RawLabResponse> {
  const message = input.message.trim();
  if (!message) {
    throw new RawLabError("Message must not be empty.");
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const url = `${baseUrl}/raw-lab`;
  const body = buildRawLabRequestBody({
    message,
    turns: input.turns ?? [],
    threadState: input.threadState ?? createEmptyRawLabThreadState()
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new RawLabError(rawLabFetchFailureMessage(baseUrl, error));
  }

  const responseText = await response.text();

  if (!response.ok) {
    const detail = parseErrorDetail(responseText);
    throw new RawLabError(detail ?? `Raw Lab request failed (${response.status}).`, response.status);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new RawLabError("Unexpected response from ai-gateway.");
  }

  return parseRawLabResponse(payload);
}
