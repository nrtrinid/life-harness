import type {
  ChatHarnessMode,
  ChatHarnessResponse,
  ConversationTurn,
  HarnessContext
} from "./harnessContext";
import type { SensitivityLevel } from "./types";

export const DEFAULT_CHAT_HARNESS_URL = "http://127.0.0.1:8111";
export const ANDROID_EMULATOR_CHAT_HARNESS_URL = "http://10.0.2.2:8111";

export const PHYSICAL_DEVICE_URL_HINT =
  "On a physical phone, use your computer's LAN IP (e.g. http://192.168.1.10:8111).";

export const CHAT_HARNESS_CORS_HINT =
  "If GET /health works in PowerShell but Expo web fails, enable dev CORS on ai-gateway (SCOUT_DEV_CORS, default on).";

export class ChatHarnessError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ChatHarnessError";
    this.status = status;
  }
}

export interface AskChatHarnessInput {
  baseUrl: string;
  message: string;
  mode: ChatHarnessMode;
  sensitivity: SensitivityLevel;
  context: HarnessContext;
  conversationHistory?: ConversationTurn[];
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

export function chatHarnessFetchFailureMessage(baseUrl: string, error: unknown): string {
  if (isBrowserFetchFailure(error)) {
    return `Browser could not complete the request to ${baseUrl}. ${CHAT_HARNESS_CORS_HINT} Otherwise confirm the gateway is running on that host and port.`;
  }
  if (error instanceof Error && error.message.trim()) {
    return `Could not reach Chat Harness at ${baseUrl}: ${error.message}`;
  }
  return `Local ai-gateway is not reachable at ${baseUrl}.`;
}

export function parseChatHarnessResponse(payload: unknown): ChatHarnessResponse {
  if (!payload || typeof payload !== "object") {
    throw new ChatHarnessError("Unexpected response from ai-gateway.");
  }

  const data = payload as Record<string, unknown>;

  if (typeof data.answer !== "string") {
    throw new ChatHarnessError("Unexpected response from ai-gateway.");
  }
  if (typeof data.used_context !== "boolean") {
    throw new ChatHarnessError("Unexpected response from ai-gateway.");
  }
  if (!Array.isArray(data.confidence_notes)) {
    throw new ChatHarnessError("Unexpected response from ai-gateway.");
  }
  if (!Array.isArray(data.safety_notes)) {
    throw new ChatHarnessError("Unexpected response from ai-gateway.");
  }

  return {
    answer: data.answer,
    used_context: data.used_context,
    confidence_notes: data.confidence_notes.filter((note): note is string => typeof note === "string"),
    safety_notes: data.safety_notes.filter((note): note is string => typeof note === "string")
  };
}

export async function askChatHarness(input: AskChatHarnessInput): Promise<ChatHarnessResponse> {
  const message = input.message.trim();
  if (!message) {
    throw new ChatHarnessError("Message must not be empty.");
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const url = `${baseUrl}/chat-harness`;
  const body = {
    message,
    mode: input.mode,
    sensitivity: input.sensitivity,
    context: input.context,
    conversation_history: input.conversationHistory ?? []
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new ChatHarnessError(chatHarnessFetchFailureMessage(baseUrl, error));
  }

  const responseText = await response.text();

  if (!response.ok) {
    const detail = parseErrorDetail(responseText);
    throw new ChatHarnessError(
      detail ?? `Chat Harness request failed (${response.status}).`,
      response.status
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new ChatHarnessError("Unexpected response from ai-gateway.");
  }

  return parseChatHarnessResponse(payload);
}
