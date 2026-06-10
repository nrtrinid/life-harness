/**
 * Job Scout runner — allowed core imports only:
 * jobSourceAdapters (transitive), jobSourceRunner, jobScout (transitive), types, ids, career (transitive).
 * Do not import app/, components/, state/, or actions.ts.
 */
import http from "node:http";

import { shouldUseWorkdayPagination } from "../../../src/core/jobSourcePagination";
import {
  buildFetchErrorRunOutput,
  canRunJobSource,
  parseFetchedRaw,
  runJobSourceFromRaw,
  runPaginatedJobSourceFromRaw
} from "../../../src/core/jobSourceRunner";
import type { JobSource } from "../../../src/core/types";
import { fetchSourceText, type FetchImpl, type FetchSourceResult } from "./fetchSource";
import type { DnsResolver } from "./safety";
import type {
  ErrorResponseBody,
  RunSourceRequestBody,
  RunSourceResponseBody
} from "./types";

export const RUNNER_HOST = "127.0.0.1";
export const RUNNER_PORT = 8122;

export interface RunnerServerOptions {
  resolveHost?: DnsResolver;
  fetchImpl?: FetchImpl;
}

function sendJson(response: http.ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(body));
}

function logRunEvent(input: {
  source: JobSource;
  method?: "GET" | "POST";
  hostname?: string;
  resolvedAddresses?: string[];
  byteSize?: number;
  candidateCount: number;
  skippedDuplicates: number;
  errors: string[];
}) {
  const hostname = input.hostname ?? (input.source.url.startsWith("/fixtures/") ? "fixture" : "unknown");
  const resolved =
    input.resolvedAddresses && input.resolvedAddresses.length > 0
      ? input.resolvedAddresses.join(",")
      : "n/a";
  const method = input.method ?? input.source.requestConfig?.method ?? "GET";
  console.log(
    `[job-scout-runner] source=${input.source.id} name="${input.source.name}" host=${hostname} method=${method} resolved=${resolved} bytes=${input.byteSize ?? 0} candidates=${input.candidateCount} skipped=${input.skippedDuplicates} errors=${input.errors.length}`
  );
  if (input.errors.length > 0) {
    console.log(`[job-scout-runner] error=${input.errors[0]}`);
  }
}

function isRunSourceRequestBody(value: unknown): value is RunSourceRequestBody {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.source !== undefined &&
    typeof record.source === "object" &&
    Array.isArray(record.existingCandidates) &&
    Array.isArray(record.resumeModules)
  );
}

function buildErrorRunResponse(
  source: JobSource,
  message: string
): RunSourceResponseBody {
  const output = buildFetchErrorRunOutput(source, message);
  return {
    result: output.result,
    candidates: output.candidates,
    updatedSourcePatch: output.updatedSource
  };
}

async function handleRunSource(
  body: RunSourceRequestBody,
  options: RunnerServerOptions
): Promise<RunSourceResponseBody> {
  const { source, existingCandidates, resumeModules } = body;

  const guard = canRunJobSource(source);
  if (!guard.ok) {
    const response = buildErrorRunResponse(source, guard.reason ?? "Cannot run source.");
    logRunEvent({
      source,
      candidateCount: 0,
      skippedDuplicates: 0,
      errors: response.result.errors
    });
    return response;
  }

  const fetchPage = async (pageSource: JobSource) => {
    const pageFetched = await fetchSourceText(pageSource.url, {
      requestConfig: pageSource.requestConfig,
      resolveHost: options.resolveHost,
      fetchImpl: options.fetchImpl
    });
    if (!pageFetched.ok) {
      return { ok: false as const, error: pageFetched.error };
    }
    return {
      ok: true as const,
      raw: parseFetchedRaw(pageSource, pageFetched.text),
      fetchMeta: pageFetched
    };
  };

  let output;
  let lastFetchMeta: FetchSourceResult | undefined;

  if (shouldUseWorkdayPagination(source)) {
    output = await runPaginatedJobSourceFromRaw(
      source,
      existingCandidates,
      resumeModules,
      async (pageSource) => {
        const pageResult = await fetchPage(pageSource);
        if (pageResult.ok) {
          lastFetchMeta = pageResult.fetchMeta;
        }
        return pageResult;
      }
    );
  } else {
    const fetched = await fetchSourceText(source.url, {
      requestConfig: source.requestConfig,
      resolveHost: options.resolveHost,
      fetchImpl: options.fetchImpl
    });

    if (!fetched.ok) {
      const response = buildErrorRunResponse(source, fetched.error);
      logRunEvent({
        source,
        candidateCount: 0,
        skippedDuplicates: 0,
        errors: response.result.errors
      });
      return response;
    }

    lastFetchMeta = fetched;
    const raw = parseFetchedRaw(source, fetched.text);
    output = runJobSourceFromRaw(source, raw, existingCandidates, resumeModules);
  }

  if (output.result.pagesFetched && output.result.pagesFetched > 0) {
    console.log(
      `[job-scout-runner] pagination pages=${output.result.pagesFetched} stopped=${output.result.paginationStoppedReason ?? "unknown"}`
    );
  }

  logRunEvent({
    source,
    method: lastFetchMeta?.method,
    hostname: lastFetchMeta?.hostname,
    resolvedAddresses: lastFetchMeta?.resolvedAddresses,
    byteSize: lastFetchMeta?.byteSize,
    candidateCount: output.candidates.length,
    skippedDuplicates: output.result.skippedDuplicates,
    errors: output.result.errors
  });

  return {
    result: output.result,
    candidates: output.candidates,
    updatedSourcePatch: output.updatedSource
  };
}

export function createServer(options: RunnerServerOptions = {}) {
  return http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "job-scout-runner",
        version: "0.4",
        mode: "local"
      });
      return;
    }

    if (request.method === "POST" && request.url === "/run-source") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", async () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
          if (!isRunSourceRequestBody(parsed)) {
            sendJson(response, 400, { error: "Malformed run-source request." } satisfies ErrorResponseBody);
            return;
          }

          const result = await handleRunSource(parsed, options);
          sendJson(response, 200, result);
        } catch {
          sendJson(response, 400, { error: "Invalid JSON body." } satisfies ErrorResponseBody);
        }
      });
      return;
    }

    sendJson(response, 404, { error: "Not found." } satisfies ErrorResponseBody);
  });
}

export function startServer(options: RunnerServerOptions = {}) {
  const server = createServer(options);
  server.listen(RUNNER_PORT, RUNNER_HOST, () => {
    console.log(`Job Scout runner listening on http://${RUNNER_HOST}:${RUNNER_PORT}`);
  });
  return server;
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"));

if (isMain) {
  startServer();
}
