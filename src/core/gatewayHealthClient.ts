import {
  DEFAULT_GATEWAY_MAX_INPUT_CHARS,
  DEFAULT_GATEWAY_TIMEOUT_SECONDS,
  DEFAULT_RAW_LAB_MAX_INPUT_CHARS
} from "./gatewayBudget";

export type GatewayHealthBudget = {
  maxInputChars: number;
  rawLabMaxInputChars: number;
  timeoutSeconds: number;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function parseBudgetPayload(payload: unknown): GatewayHealthBudget | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const budget = (payload as { budget?: unknown }).budget;
  if (!budget || typeof budget !== "object") {
    return null;
  }
  const record = budget as Record<string, unknown>;
  const maxInputChars = record.max_input_chars;
  const rawLabMaxInputChars = record.raw_lab_max_input_chars;
  const timeoutSeconds = record.timeout_seconds;
  if (
    typeof maxInputChars !== "number" ||
    typeof rawLabMaxInputChars !== "number" ||
    typeof timeoutSeconds !== "number"
  ) {
    return null;
  }
  return {
    maxInputChars,
    rawLabMaxInputChars,
    timeoutSeconds
  };
}

export function fallbackGatewayHealthBudget(): GatewayHealthBudget {
  return {
    maxInputChars: DEFAULT_GATEWAY_MAX_INPUT_CHARS,
    rawLabMaxInputChars: DEFAULT_RAW_LAB_MAX_INPUT_CHARS,
    timeoutSeconds: DEFAULT_GATEWAY_TIMEOUT_SECONDS
  };
}

export async function fetchGatewayHealthBudget(
  baseUrl: string
): Promise<GatewayHealthBudget> {
  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/health`);
    if (!response.ok) {
      return fallbackGatewayHealthBudget();
    }
    const payload: unknown = await response.json();
    return parseBudgetPayload(payload) ?? fallbackGatewayHealthBudget();
  } catch {
    return fallbackGatewayHealthBudget();
  }
}
