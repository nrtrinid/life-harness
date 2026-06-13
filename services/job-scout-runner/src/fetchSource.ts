import fs from "node:fs/promises";

import {
  resolveGovernmentJobsFetchUrl,
  resolveIcimsFetchUrl
} from "../../../src/core/jobSourceAdapters";
import {
  buildSafeRequestHeaders,
  validateJobSourceRequestConfig
} from "../../../src/core/jobSourceRequestConfig";
import type { JobSourceKind, JobSourceRequestConfig } from "../../../src/core/types";
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
  method: "GET" | "POST";
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
  return { ok: true, text, byteSize, mode: "fixture", method: "GET" };
}

async function fetchNetworkUrl(
  url: string,
  resolvedAddresses: string[],
  fetchImpl: FetchImpl,
  requestConfig?: JobSourceRequestConfig,
  kind?: JobSourceKind,
  cookieHeader?: string
): Promise<FetchSourceResult | FetchSourceError> {
  let hostname: string | undefined;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = undefined;
  }

  const method = requestConfig?.method ?? "GET";
  const browserUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  let headers: Record<string, string> = buildSafeRequestHeaders();
  if (kind === "governmentjobs" && method === "GET") {
    headers = {
      ...headers,
      Accept: "text/html,application/xhtml+xml,*/*",
      "X-Requested-With": "XMLHttpRequest"
    };
  }
  if (kind === "icims") {
    try {
      const origin = new URL(url).origin;
      headers = {
        ...headers,
        Referer: `${origin}/jobs/search`,
        "User-Agent": browserUserAgent,
        Accept: "text/html,application/xhtml+xml,*/*"
      };
    } catch {
      // keep safe defaults
    }
  }
  if (kind === "workday" && method === "POST") {
    try {
      const parsed = new URL(url);
      const sitePath = parsed.pathname.replace(/\/wday\/cxs\/[^/]+\/[^/]+\/jobs\/?$/i, "");
      const referer = sitePath ? `${parsed.origin}${sitePath}` : parsed.origin;
      headers = {
        ...headers,
        Referer: referer,
        Accept: "application/json",
        "User-Agent": browserUserAgent
      };
    } catch {
      // keep safe defaults
    }
  }
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  };
  if (method === "POST") {
    init.body = JSON.stringify(requestConfig?.bodyJson ?? {});
  }

  const response = await fetchImpl(url, init);
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
    method,
    hostname,
    resolvedAddresses
  };
}

export async function fetchSourceText(
  url: string,
  options: {
    requestConfig?: JobSourceRequestConfig;
    resolveHost?: DnsResolver;
    fetchImpl?: FetchImpl;
    kind?: JobSourceKind;
  } = {}
): Promise<FetchSourceResult | FetchSourceError> {
  const configValidation = validateJobSourceRequestConfig(options.requestConfig);
  if (!configValidation.ok) {
    return { ok: false, error: configValidation.error };
  }

  const fetchUrl =
    options.kind === "governmentjobs"
      ? resolveGovernmentJobsFetchUrl(url)
      : options.kind === "icims"
        ? resolveIcimsFetchUrl(url)
        : url;
  const safety = await assertUrlSafeForFetch(fetchUrl, options.resolveHost);
  if (!safety.ok) {
    return { ok: false, error: safety.error };
  }

  if (safety.mode === "fixture") {
    const fixture = await readFixture(safety.filePath);
    if (!fixture.ok) {
      return fixture;
    }
    return {
      ...fixture,
      method: options.requestConfig?.method ?? "GET"
    };
  }

  if (options.kind === "icims") {
    try {
      const origin = new URL(safety.url).origin;
      const warmup = await (options.fetchImpl ?? fetch)(`${origin}/jobs/search`, {
        method: "GET",
        headers: {
          ...buildSafeRequestHeaders(),
          Referer: `${origin}/jobs/search`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,*/*"
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      const setCookie = warmup.headers.get("set-cookie");
      if (setCookie) {
        return fetchNetworkUrl(
          safety.url,
          safety.resolvedAddresses,
          options.fetchImpl ?? fetch,
          options.requestConfig,
          options.kind,
          setCookie
        );
      }
    } catch {
      // fall through to direct fetch
    }
  }

  return fetchNetworkUrl(
    safety.url,
    safety.resolvedAddresses,
    options.fetchImpl ?? fetch,
    options.requestConfig,
    options.kind
  );
}

export function getSafetyMode(safety: UrlSafetyResult): "fixture" | "network" | "error" {
  if (!safety.ok) {
    return "error";
  }
  return safety.mode;
}
