import http from "node:http";

import { describe, expect, it, vi } from "vitest";

import { seedResumeModules } from "../../../src/data/seedJobScout";
import { readResponseWithByteCap } from "../src/fetchSource";
import { assertUrlSafeForFetch, isBlockedIp } from "../src/safety";
import { createServer } from "../src/server";
import type { RunSourceRequestBody, RunSourceResponseBody } from "../src/types";

const fixtureSource = {
  id: "source-fixture-greenhouse",
  name: "Local Fixture Source",
  url: "/fixtures/sample-greenhouse.json",
  kind: "greenhouse" as const,
  enabled: true,
  cadence: "manual" as const
};

function postRunSource(
  port: number,
  body: Partial<RunSourceRequestBody> | Record<string, unknown>
): Promise<{ statusCode: number; body: RunSourceResponseBody | { error: string } }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/run-source",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 500,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
          });
        });
      }
    );
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

describe("job-scout-runner safety", () => {
  it("blocks private IPv4 addresses", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.5")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });

  it("blocks DNS-resolved private targets", async () => {
    const result = await assertUrlSafeForFetch("http://jobs.example.com/listings", async () => [
      "192.168.1.50"
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("private/internal");
    }
  });

  it("aborts large streamed responses before exceeding max size", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
        controller.close();
      }
    });
    const response = new Response(stream);
    const result = await readResponseWithByteCap(response);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("2 MB");
    }
  });
});

describe("job-scout-runner server", () => {
  it("returns health ok", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const body = await new Promise<string>((resolve, reject) => {
      http
        .get({ hostname: "127.0.0.1", port, path: "/health" }, (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        })
        .on("error", reject);
    });

    expect(JSON.parse(body)).toMatchObject({
      status: "ok",
      service: "job-scout-runner",
      version: "0.4"
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 400 for malformed requests", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const result = await postRunSource(port, { existingCandidates: [], resumeModules: [] });
    expect(result.statusCode).toBe(400);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns source_fetch candidates for fixture URL", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const result = await postRunSource(port, {
      source: fixtureSource,
      existingCandidates: [],
      resumeModules: seedResumeModules
    });

    expect(result.statusCode).toBe(200);
    const body = result.body as RunSourceResponseBody;
    expect(body.result.errors).toHaveLength(0);
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.candidates.every((candidate) => candidate.origin === "source_fetch")).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("blocks literal private URLs with 200 error-run", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const result = await postRunSource(port, {
      source: { ...fixtureSource, url: "http://192.168.1.1/jobs.json" },
      existingCandidates: [],
      resumeModules: seedResumeModules
    });

    expect(result.statusCode).toBe(200);
    const body = result.body as RunSourceResponseBody;
    expect(body.result.errors.length).toBeGreaterThan(0);
    expect(body.candidates).toHaveLength(0);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("blocks unsupported source kinds with 200 error-run", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const result = await postRunSource(port, {
      source: { ...fixtureSource, kind: "company_careers" },
      existingCandidates: [],
      resumeModules: seedResumeModules
    });

    const body = result.body as RunSourceResponseBody;
    expect(body.result.errors[0]).toContain("Unsupported source kind");

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 200 error-run for non-2xx fetch responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));
    const server = createServer({
      resolveHost: async () => ["8.8.8.8"],
      fetchImpl
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const result = await postRunSource(port, {
      source: {
        ...fixtureSource,
        url: "https://boards.example.com/jobs.json",
        kind: "greenhouse"
      },
      existingCandidates: [],
      resumeModules: seedResumeModules
    });

    const body = result.body as RunSourceResponseBody;
    expect(body.result.errors[0]).toContain("HTTP 404");

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 200 error-run when response exceeds max size", async () => {
    const huge = "x".repeat(2 * 1024 * 1024 + 1);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(huge, { status: 200 }));
    const server = createServer({
      resolveHost: async () => ["8.8.8.8"],
      fetchImpl
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const result = await postRunSource(port, {
      source: {
        ...fixtureSource,
        url: "https://boards.example.com/jobs.json",
        kind: "greenhouse"
      },
      existingCandidates: [],
      resumeModules: seedResumeModules
    });

    const body = result.body as RunSourceResponseBody;
    expect(body.result.errors[0]).toContain("2 MB");

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("dedupes candidates on second run", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const first = await postRunSource(port, {
      source: fixtureSource,
      existingCandidates: [],
      resumeModules: seedResumeModules
    });
    const firstBody = first.body as RunSourceResponseBody;

    const second = await postRunSource(port, {
      source: fixtureSource,
      existingCandidates: firstBody.candidates,
      resumeModules: seedResumeModules
    });
    const secondBody = second.body as RunSourceResponseBody;

    expect(secondBody.result.skippedDuplicates).toBeGreaterThan(0);
    expect(secondBody.candidates).toHaveLength(0);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("respects maxResults", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const result = await postRunSource(port, {
      source: { ...fixtureSource, maxResults: 1 },
      existingCandidates: [],
      resumeModules: seedResumeModules
    });

    const body = result.body as RunSourceResponseBody;
    expect(body.candidates.length).toBeLessThanOrEqual(1);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns source_fetch candidates for workday POST fixture source", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const result = await postRunSource(port, {
      source: {
        id: "source-workday-cxs-fixture",
        name: "Workday Endpoint Fixture",
        url: "/fixtures/sample-workday-cxs-response.json",
        kind: "workday",
        enabled: true,
        cadence: "manual",
        requestConfig: {
          method: "POST",
          bodyJson: { appliedFacets: {}, limit: 20, offset: 0, searchText: "" }
        }
      },
      existingCandidates: [],
      resumeModules: seedResumeModules
    });

    const body = result.body as RunSourceResponseBody;
    expect(body.result.errors).toHaveLength(0);
    expect(body.candidates.length).toBeGreaterThanOrEqual(2);
    expect(body.candidates.every((candidate) => candidate.origin === "source_fetch")).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns error-run when requestConfig contains forbidden credential keys", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const result = await postRunSource(port, {
      source: {
        ...fixtureSource,
        kind: "workday",
        url: "/fixtures/sample-workday-cxs-response.json",
        requestConfig: {
          method: "POST",
          bodyJson: { session: "abc", appliedFacets: {} }
        }
      },
      existingCandidates: [],
      resumeModules: seedResumeModules
    });

    const body = result.body as RunSourceResponseBody;
    expect(body.result.errors[0]).toContain("session");
    expect(body.candidates).toHaveLength(0);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("blocks private URL targets for POST sources", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const result = await postRunSource(port, {
      source: {
        ...fixtureSource,
        kind: "workday",
        url: "http://192.168.1.1/jobs",
        requestConfig: {
          method: "POST",
          bodyJson: { appliedFacets: {}, limit: 20, offset: 0, searchText: "" }
        }
      },
      existingCandidates: [],
      resumeModules: seedResumeModules
    });

    const body = result.body as RunSourceResponseBody;
    expect(body.result.errors[0]).toContain("Blocked URL hostname");

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
