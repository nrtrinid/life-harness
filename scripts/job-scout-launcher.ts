import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LAUNCHER_HOST = "127.0.0.1";
export const LAUNCHER_PORT = 8123;
export const RUNNER_HEALTH_URL = "http://127.0.0.1:8122/health";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let runnerChild: ChildProcess | null = null;
let starting = false;

export async function isRunnerHealthy(): Promise<boolean> {
  try {
    const response = await fetch(RUNNER_HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

function spawnRunnerProcess(): void {
  if (runnerChild && runnerChild.exitCode === null && !runnerChild.killed) {
    return;
  }

  runnerChild = spawn("npx", ["tsx", "services/job-scout-runner/src/server.ts"], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: "ignore",
    shell: true,
    windowsHide: true
  });
  runnerChild.unref();
}

export async function startRunnerAndWait(timeoutMs = 12_000): Promise<{ ok: boolean; message: string }> {
  if (await isRunnerHealthy()) {
    return { ok: true, message: "Job Scout Runner is already awake on 127.0.0.1:8122." };
  }

  if (starting) {
    return { ok: false, message: "Runner is starting — try Check again in a few seconds." };
  }

  starting = true;
  try {
    spawnRunnerProcess();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await isRunnerHealthy()) {
        return { ok: true, message: "Job Scout Runner started on 127.0.0.1:8122." };
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    return {
      ok: false,
      message: "Runner did not respond in time. Try Start runner again or run npm run scout:runner."
    };
  } finally {
    starting = false;
  }
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

export function createLauncherServer() {
  return http.createServer((request, response) => {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      void isRunnerHealthy().then((runnerUp) => {
        sendJson(response, 200, {
          ok: true,
          runnerUp,
          message: runnerUp
            ? "Launcher awake; runner is up."
            : "Launcher awake; runner is not running yet."
        });
      });
      return;
    }

    if (request.method === "POST" && request.url === "/start") {
      void startRunnerAndWait().then((result) => {
        sendJson(response, result.ok ? 200 : 503, result);
      });
      return;
    }

    sendJson(response, 404, { ok: false, message: "Not found." });
  });
}

const server = createLauncherServer();
server.listen(LAUNCHER_PORT, LAUNCHER_HOST, () => {
  console.log(`[job-scout-launcher] listening on http://${LAUNCHER_HOST}:${LAUNCHER_PORT}`);
});
