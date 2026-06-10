import type { JobSourceRequestConfig } from "./types";

export const FORBIDDEN_CREDENTIAL_KEY_PATTERN =
  /cookie|authorization|bearer|csrf|session/i;

const MAX_CREDENTIAL_SCAN_DEPTH = 3;

export function formatCredentialKeyError(key: string): string {
  return `Credential-like key detected: ${key}. Do not paste cookies, auth headers, CSRF tokens, or session data.`;
}

export function findForbiddenCredentialKey(
  value: unknown,
  depth = 0
): string | undefined {
  if (depth > MAX_CREDENTIAL_SCAN_DEPTH) {
    return undefined;
  }
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenCredentialKey(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_CREDENTIAL_KEY_PATTERN.test(key)) {
      return key;
    }
    const nested = findForbiddenCredentialKey(
      (value as Record<string, unknown>)[key],
      depth + 1
    );
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

export function containsForbiddenCredentialKeys(value: unknown): string | undefined {
  return findForbiddenCredentialKey(value);
}

export type ParseJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export function parseJsonBodyText(text: string): ParseJsonBodyResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, value: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: false, error: "Request body must be valid JSON." };
  }
  const forbiddenKey = containsForbiddenCredentialKeys(parsed);
  if (forbiddenKey) {
    return { ok: false, error: formatCredentialKeyError(forbiddenKey) };
  }
  return { ok: true, value: parsed };
}

export function buildSafeRequestHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json"
  };
}

export function validateJobSourceRequestConfig(
  config: JobSourceRequestConfig | undefined
): { ok: true } | { ok: false; error: string } {
  if (!config) {
    return { ok: true };
  }
  if (config.method !== "GET" && config.method !== "POST") {
    return { ok: false, error: "Request method must be GET or POST." };
  }
  if (config.bodyJson !== undefined) {
    const forbiddenKey = containsForbiddenCredentialKeys(config.bodyJson);
    if (forbiddenKey) {
      return { ok: false, error: formatCredentialKeyError(forbiddenKey) };
    }
  }
  if (config.method === "POST" && config.bodyJson === undefined) {
    return { ok: false, error: "POST request requires a JSON body." };
  }
  return { ok: true };
}
