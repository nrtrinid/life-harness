import fs from "node:fs/promises";

import {
  assertUrlSafeForFetch,
  FETCH_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  type DnsResolver,
  type UrlSafetyResult
} from "./safety";

export type FetchImpl = typeof fetch;

export interface FetchSourceResult {
  ok: true;
  text: string;
  byteSize: number;
  mode: "fixture" | "network";
  hostname?: string;
  resolvedAddresses?: string[];
}

export interface FetchSourceError {
  ok: false;
  error: string;
}

export async function readResponseWithByteCap(response: Response): Promise<
  | { ok: true; text: string; byteSize: number }
  | { ok: false; error: string }
> {
  if (!response.body) {
    const text = await response.text();
    const byteSize = Buffer.byteLength(text, "utf8");
    if (byteSize > MAX_RESPONSE_BYTES) {
      return { ok: false, error: "Response exceeded max size (2 MB)." };
    }
    return { ok: true, text, byteSize };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return { ok: false, error: "Response exceeded max size (2 MB)." };
    }
    chunks.push(value);
  }

  const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { ok: true, text: merged.toString("utf8"), byteSize: merged.byteLength };
}

async function readFixture(filePath: string): Promise<FetchSourceResult | FetchSourceError> {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_RESPONSE_BYTES) {
    return { ok: false, error: "Fixture exceeded max size (2 MB)." };
  }
  const text = await fs.readFile(filePath, "utf8");
  const byteSize = Buffer.byteLength(text, "utf8");
  if (byteSize > MAX_RESPONSE_BYTES) {
    return { ok: false, error: "Fixture exceeded max size (2 MB)." };
  }
  return { ok: true, text, byteSize, mode: "fixture" };
}

async function fetchNetworkUrl(
  url: string,
  resolvedAddresses: string[],
  fetchImpl: FetchImpl
): Promise<FetchSourceResult | FetchSourceError> {
  let hostname: string | undefined;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = undefined;
  }

  const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    return { ok: false, error: `Fetch failed with HTTP ${response.status}.` };
  }

  const body = await readResponseWithByteCap(response);
  if (!body.ok) {
    return body;
  }

  return {
    ok: true,
    text: body.text,
    byteSize: body.byteSize,
    mode: "network",
    hostname,
    resolvedAddresses
  };
}

export async function fetchSourceText(
  url: string,
  options: { resolveHost?: DnsResolver; fetchImpl?: FetchImpl } = {}
): Promise<FetchSourceResult | FetchSourceError> {
  const safety = await assertUrlSafeForFetch(url, options.resolveHost);
  if (!safety.ok) {
    return { ok: false, error: safety.error };
  }

  if (safety.mode === "fixture") {
    return readFixture(safety.filePath);
  }

  return fetchNetworkUrl(safety.url, safety.resolvedAddresses, options.fetchImpl ?? fetch);
}

export function getSafetyMode(safety: UrlSafetyResult): "fixture" | "network" | "error" {
  if (!safety.ok) {
    return "error";
  }
  return safety.mode;
}
