import type { Page, Request } from "@playwright/test";

import { FEATURE_SPRINT_RUNNER_DEFAULT_BASE_URL } from "../../src/core/featureSprintRunner";

export type RunnerTestMetrics = {
  postCount: number;
  spawnCount: number;
  lastAttemptId: string | null;
};

const RUNNER_TOKEN = process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN?.trim() || "life-harness-dev";
const RUNNER_BASE =
  process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_BASE_URL?.trim() || FEATURE_SPRINT_RUNNER_DEFAULT_BASE_URL;

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${RUNNER_TOKEN}`,
    "Content-Type": "application/json"
  };
}

export async function resetRunnerTestMetrics(): Promise<RunnerTestMetrics> {
  const response = await fetch(`${RUNNER_BASE}/feature-sprint/test/reset-metrics`, {
    method: "POST",
    headers: authHeaders()
  });
  if (!response.ok) {
    throw new Error(`reset-metrics failed: ${response.status}`);
  }
  return (await response.json()) as RunnerTestMetrics;
}

export async function getRunnerTestMetrics(): Promise<RunnerTestMetrics> {
  const response = await fetch(`${RUNNER_BASE}/feature-sprint/test/metrics`, {
    method: "GET",
    headers: authHeaders()
  });
  if (!response.ok) {
    throw new Error(`metrics failed: ${response.status}`);
  }
  return (await response.json()) as RunnerTestMetrics;
}

/** Ask the mock runner to journal the next successful run without finishing the HTTP response. */
export async function armHangNextRunResponse(): Promise<void> {
  const response = await fetch(`${RUNNER_BASE}/feature-sprint/test/hang-next-run-response`, {
    method: "POST",
    headers: authHeaders()
  });
  if (!response.ok) {
    throw new Error(`hang-next-run-response failed: ${response.status}`);
  }
}

export function captureRunPostBodies(page: Page): {
  runPostRequests: Request[];
  capturedAttemptIds: string[];
} {
  const runPostRequests: Request[] = [];
  const capturedAttemptIds: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().includes("/feature-sprint/run")) {
      return;
    }
    runPostRequests.push(request);
    try {
      const body = request.postDataJSON() as { attemptId?: string };
      if (typeof body.attemptId === "string") {
        capturedAttemptIds.push(body.attemptId);
      }
    } catch {
      // ignore
    }
  });
  return { runPostRequests, capturedAttemptIds };
}

export async function getAttemptStatusFromRunner(attemptId: string): Promise<{
  status: string;
  resultOk?: boolean;
}> {
  const response = await fetch(
    `${RUNNER_BASE}/feature-sprint/attempts/${encodeURIComponent(attemptId)}`,
    {
      method: "GET",
      headers: authHeaders()
    }
  );
  const body = (await response.json()) as {
    status?: string;
    result?: { ok?: boolean };
  };
  return { status: body.status ?? "unknown", resultOk: body.result?.ok };
}
