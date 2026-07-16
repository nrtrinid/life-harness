/**
 * Integrated Cursor + executionContext smoke (Node).
 *
 * Requires a running cursor/real runner:
 *   npm run feature-runner:cursor
 *
 * Usage:
 *   npx tsx services/feature-sprint-runner/scripts/smoke_cursor_execution_context.ts
 *
 * Exit: 0 pass, 1 fail, 2 blocked
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function loadEnvLocal(repoRoot: string): void {
  const envPath = path.join(repoRoot, "services/feature-sprint-runner/.env.local");
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) {
      process.env[name] = value;
    }
  }
}

function exitBlocked(blocker: string, detail?: string): never {
  console.log("SMOKE_STATUS=blocked");
  console.log(`BLOCKER=${blocker}`);
  if (detail) {
    console.log(detail);
  }
  process.exit(2);
}

function exitFailed(blocker: string, detail?: string): never {
  console.log("SMOKE_STATUS=failed");
  console.log(`BLOCKER=${blocker}`);
  if (detail) {
    console.log(detail);
  }
  process.exit(1);
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "../../..");
  loadEnvLocal(repoRoot);

  const baseUrl = (process.env.FEATURE_SPRINT_RUNNER_BASE_URL ?? "http://127.0.0.1:8127").replace(
    /\/$/,
    ""
  );
  const token = process.env.FEATURE_SPRINT_RUNNER_TOKEN?.trim();
  if (!token) {
    exitBlocked("missing_FEATURE_SPRINT_RUNNER_TOKEN");
  }
  if (!process.env.CURSOR_API_KEY?.trim()) {
    exitBlocked("missing_CURSOR_API_KEY");
  }
  if (process.env.FEATURE_SPRINT_RUNNER_ENABLE_CURSOR !== "1") {
    exitBlocked("FEATURE_SPRINT_RUNNER_ENABLE_CURSOR");
  }

  const nonce = `LH_CTX_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const executionContext = {
    planId: "plan-smoke-ctx",
    executionModel: "sprint_map" as const,
    sprintId: "sprint-smoke-1",
    storyId: "story-smoke-1",
    taskId: "task-smoke-1",
    phase: "review" as const,
    stepId: "step-smoke-1"
  };

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  let health: Response;
  try {
    health = await fetch(`${baseUrl}/health`, { headers });
  } catch {
    exitBlocked("runner_unreachable", "HINT=Start with: npm run feature-runner:cursor");
  }
  const healthBody = (await health.json().catch(() => null)) as { ok?: boolean } | null;
  if (!health.ok || !healthBody?.ok) {
    exitBlocked("runner_unhealthy", JSON.stringify(healthBody));
  }

  console.log("Posting cursor_review with typed executionContext...");
  const response = await fetch(`${baseUrl}/feature-sprint/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      profile: "cursor_review",
      promptMarkdown: [
        "You are running a read-only Feature Sprint review smoke for Life Harness.",
        "",
        "Respond with plain text that includes this exact nonce on its own line:",
        nonce,
        "",
        "Do not modify any files. Do not run destructive commands. Keep the answer under 5 lines."
      ].join("\n"),
      timeoutMs: 180_000,
      executionContext
    })
  });

  const raw = await response.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    exitFailed("unreadable_response", raw.slice(0, 500));
  }

  const echo = parsed.executionContext as Record<string, unknown> | undefined;
  if (!echo || typeof echo !== "object") {
    exitFailed("missing_execution_context_echo", raw.slice(0, 1200));
  }

  for (const key of ["planId", "sprintId", "storyId", "taskId", "phase"] as const) {
    if (echo[key] !== executionContext[key]) {
      exitFailed(
        `context_mismatch_${key}`,
        `expected=${executionContext[key]} actual=${String(echo[key])}`
      );
    }
  }

  const outputText = typeof parsed.outputText === "string" ? parsed.outputText : "";
  if (!outputText.trim() || !outputText.includes(nonce)) {
    exitFailed(
      "nonce_missing_or_empty_output",
      JSON.stringify({
        resultUsability: parsed.resultUsability,
        failureClass: parsed.failureClass,
        diagnosticMessage: parsed.diagnosticMessage,
        error: parsed.error,
        outputPreview: outputText.slice(0, 400)
      })
    );
  }

  if (parsed.ok !== true) {
    exitFailed("runner_reported_not_ok", raw.slice(0, 1200));
  }

  console.log("SMOKE_STATUS=passed");
  console.log(`ECHO_PLAN_ID=${echo.planId}`);
  console.log(`ECHO_SPRINT_ID=${echo.sprintId}`);
  console.log(`ECHO_STORY_ID=${echo.storyId}`);
  console.log(`ECHO_TASK_ID=${echo.taskId}`);
  console.log(`ECHO_PHASE=${echo.phase}`);
  console.log(`RUN_ID=${String(parsed.runId ?? "")}`);
  console.log(
    "NOTE=No automatic import/save/advance/complete/cleanup was invoked by this smoke."
  );
}

main().catch((error) => {
  exitFailed("uncaught", String(error));
});
