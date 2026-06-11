/**
 * Feature Sprint runner — allowed core imports only from src/core/featureSprintRunner.ts.
 * Do not import app/, components/, state/, or actions.ts.
 */
import http from "node:http";

import {
  FEATURE_SPRINT_RUNNER_DEFAULT_PORT,
  validateFeatureSprintRunnerRequest,
  type FeatureSprintRunnerResponse
} from "../../../src/core/featureSprintRunner";
import { isAuthorizedRequest } from "./auth";
import { resolveRunnerMode, runFeatureSprintPacketOnRunner } from "./runCodex";

export const RUNNER_HOST = "127.0.0.1";
export const RUNNER_PORT = Number.parseInt(
  process.env.FEATURE_SPRINT_RUNNER_PORT ?? String(FEATURE_SPRINT_RUNNER_DEFAULT_PORT),
  10
);

type ErrorResponseBody = { error: string };

function sendJson(response: http.ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function assertCodexModeAllowed(): string | undefined {
  if (resolveRunnerMode() !== "codex") {
    return undefined;
  }

  if (process.env.FEATURE_SPRINT_RUNNER_ENABLE_CODEX !== "1") {
    return "Real Codex mode requires FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1.";
  }

  if (!process.env.FEATURE_SPRINT_RUNNER_TOKEN?.trim()) {
    return "Real Codex mode requires FEATURE_SPRINT_RUNNER_TOKEN.";
  }

  return undefined;
}

export function createServer() {
  return http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      });
      response.end();
      return;
    }

    if (!isAuthorizedRequest(request)) {
      sendJson(response, 401, { error: "Unauthorized." } satisfies ErrorResponseBody);
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      const codexGate = assertCodexModeAllowed();
      sendJson(response, codexGate ? 503 : 200, {
        ok: !codexGate,
        mode: resolveRunnerMode(),
        port: RUNNER_PORT,
        error: codexGate
      });
      return;
    }

    if (request.method === "POST" && request.url === "/feature-sprint/run") {
      try {
        const parsed = await readJsonBody(request);
        const validated = validateFeatureSprintRunnerRequest(parsed);
        if (!validated.ok) {
          sendJson(response, 400, { error: validated.error } satisfies ErrorResponseBody);
          return;
        }

        const codexGate = assertCodexModeAllowed();
        if (codexGate) {
          sendJson(response, 403, { error: codexGate } satisfies ErrorResponseBody);
          return;
        }

        const result: FeatureSprintRunnerResponse = await runFeatureSprintPacketOnRunner(
          validated.request
        );
        sendJson(response, result.ok ? 200 : 500, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request.";
        sendJson(response, 400, { error: message } satisfies ErrorResponseBody);
      }
      return;
    }

    sendJson(response, 404, { error: "Not found." } satisfies ErrorResponseBody);
  });
}

export function startServer() {
  const server = createServer();
  server.listen(RUNNER_PORT, RUNNER_HOST, () => {
    console.log(
      `[feature-sprint-runner] listening on http://${RUNNER_HOST}:${RUNNER_PORT} mode=${resolveRunnerMode()}`
    );
  });
  return server;
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"));

if (isMain) {
  startServer();
}
