/**
 * Feature Sprint runner — allowed core imports only from src/core/featureSprintRunner.ts.
 * Do not import app/, components/, state/, or actions.ts.
 */
import http from "node:http";

import {
  FEATURE_SPRINT_RUNNER_DEFAULT_PORT,
  validateFeatureSprintRunnerRequest,
  validateFeatureSprintWorktreeCleanupRequest,
  type FeatureSprintRunnerResponse
} from "../../../src/core/featureSprintRunner";
import { isAuthorizedRequest } from "./auth";
import {
  assertRealRunAllowed,
  resolveProviderAvailability,
  resolveRunnerMode,
  runFeatureSprintPacketOnRunner
} from "./runPacket";
import { buildSetupDiagnostics } from "./setupDiagnostics";
import { cleanupFeatureSprintWorktree } from "./worktreeCleanup";

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

function resolveHealthStatus(): {
  ok: boolean;
  mode: ReturnType<typeof resolveRunnerMode>;
  codexAvailable: boolean;
  cursorAvailable: boolean;
  error?: string;
} {
  const mode = resolveRunnerMode();
  const { codexAvailable, cursorAvailable } = resolveProviderAvailability();

  if (mode === "mock") {
    return { ok: true, mode, codexAvailable, cursorAvailable };
  }

  if (mode === "codex" && !codexAvailable) {
    return {
      ok: false,
      mode,
      codexAvailable,
      cursorAvailable,
      error: "Real Codex mode requires FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1 and FEATURE_SPRINT_RUNNER_TOKEN."
    };
  }

  if (mode === "cursor" && !cursorAvailable) {
    return {
      ok: false,
      mode,
      codexAvailable,
      cursorAvailable,
      error:
        "Real Cursor mode requires FEATURE_SPRINT_RUNNER_ENABLE_CURSOR=1, FEATURE_SPRINT_RUNNER_TOKEN, and CURSOR_API_KEY."
    };
  }

  if (mode === "real" && !codexAvailable && !cursorAvailable) {
    return {
      ok: false,
      mode,
      codexAvailable,
      cursorAvailable,
      error:
        "Real mode requires at least one enabled provider (Codex and/or Cursor env flags, token, and CURSOR_API_KEY for Cursor)."
    };
  }

  return { ok: true, mode, codexAvailable, cursorAvailable };
}

async function resolveHealthPayload() {
  const health = resolveHealthStatus();
  const setup = await buildSetupDiagnostics();
  return { ...health, setup, port: RUNNER_PORT };
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
      const health = await resolveHealthPayload();
      sendJson(response, health.ok ? 200 : 503, health);
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

        const runGate = assertRealRunAllowed(validated.request.profile);
        if (runGate) {
          sendJson(response, 403, { error: runGate } satisfies ErrorResponseBody);
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

    if (request.method === "POST" && request.url === "/feature-sprint/cleanup-worktree") {
      try {
        const parsed = await readJsonBody(request);
        const validated = validateFeatureSprintWorktreeCleanupRequest(parsed);
        if (!validated.ok) {
          sendJson(response, 400, { error: validated.error } satisfies ErrorResponseBody);
          return;
        }

        const result = await cleanupFeatureSprintWorktree(validated.request);
        sendJson(response, 200, result);
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
