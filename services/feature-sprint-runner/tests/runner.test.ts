import http from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseFeatureReviewVerdictBlock, parseFeatureSprintPlanBlock } from "../../../src/core/featureSprintOrchestrator";
import type { FeatureSprintRunnerRequest, FeatureSprintRunnerResponse } from "../../../src/core/featureSprintRunner";
import { createServer } from "../src/server";

const baseRequest: FeatureSprintRunnerRequest = {
  profile: "codex_scoping",
  promptMarkdown: "Scope this feature sprint."
};

function postRun(
  port: number,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; body: FeatureSprintRunnerResponse | { error: string } }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/feature-sprint/run",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers
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

function getHealth(
  port: number,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; body: { ok?: boolean; mode?: string; error?: string } }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/health",
        method: "GET",
        headers
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
    request.end();
  });
}

describe("feature-sprint-runner", () => {
  const envSnapshot = { ...process.env };
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    process.env = { ...envSnapshot };
    delete process.env.FEATURE_SPRINT_RUNNER_MODE;
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_CODEX;
    delete process.env.FEATURE_SPRINT_RUNNER_TOKEN;

    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        port = typeof address === "object" && address ? address.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    process.env = { ...envSnapshot };
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("defaults to mock mode when MODE is unset", async () => {
    const health = await getHealth(port);
    expect(health.statusCode).toBe(200);
    expect(health.body.mode).toBe("mock");

    const result = await postRun(port, baseRequest);
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ ok: true, profile: "codex_scoping" });
    if ("outputText" in result.body && result.body.outputText) {
      expect(parseFeatureSprintPlanBlock(result.body.outputText)?.title).toBeTruthy();
    }
  });

  it("returns mock review fence for codex_review", async () => {
    const result = await postRun(port, {
      profile: "codex_review",
      promptMarkdown: "Review this output."
    });
    expect(result.statusCode).toBe(200);
    if ("outputText" in result.body && result.body.outputText) {
      expect(parseFeatureReviewVerdictBlock(result.body.outputText)?.status).toBe("accepted");
    }
  });

  it("rejects MODE=codex without ENABLE_CODEX=1", async () => {
    process.env.FEATURE_SPRINT_RUNNER_MODE = "codex";

    const result = await postRun(port, baseRequest);
    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({
      error: expect.stringContaining("FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1")
    });
  });

  it("rejects invalid profile", async () => {
    const result = await postRun(port, {
      profile: "codex_implementation",
      promptMarkdown: "nope"
    });
    expect(result.statusCode).toBe(400);
  });

  it("rejects empty prompt", async () => {
    const result = await postRun(port, {
      profile: "codex_scoping",
      promptMarkdown: ""
    });
    expect(result.statusCode).toBe(400);
  });

  it("requires bearer token when token is configured", async () => {
    process.env.FEATURE_SPRINT_RUNNER_TOKEN = "secret-token";

    const unauthorized = await postRun(port, baseRequest);
    expect(unauthorized.statusCode).toBe(401);

    const wrongToken = await postRun(port, baseRequest, {
      Authorization: "Bearer wrong"
    });
    expect(wrongToken.statusCode).toBe(401);

    const authorized = await postRun(port, baseRequest, {
      Authorization: "Bearer secret-token"
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.body).toMatchObject({ ok: true });
  });
});
