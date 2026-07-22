/**
 * Opt-in real Cursor Grok 4.5 read-only review smoke.
 *
 * Proves:
 *   cursor_review → FEATURE_SPRINT_CURSOR_REVIEW_MODEL → nonempty output
 *   → no repository mutation → requested/resolved model evidence captured honestly
 *
 * Requires a running cursor/real runner:
 *   npm run feature-runner:cursor
 *
 * Usage (from repo root):
 *   npx tsx services/feature-sprint-runner/scripts/smoke_grok_review.ts
 *
 * Exit: 0 pass, 1 fail, 2 blocked
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const GROK_MODEL_ID = "cursor-grok-4.5-high";

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

function gitStatusPorcelain(cwd: string): string {
  return execFileSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8"
  }).trim();
}

function createDisposableRepo(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "lh-grok-review-smoke-"));
  execFileSync("git", ["init"], { cwd: root, encoding: "utf8" });
  execFileSync("git", ["config", "user.email", "smoke@life-harness.local"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Life Harness Smoke"], { cwd: root });
  writeFileSync(
    path.join(root, "README.md"),
    "# Grok review smoke fixture\n\nSafe disposable repo.\n",
    "utf8"
  );
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "src", "add.ts"), "export function add(a: number, b: number) {\n  return a + b;\n}\n", "utf8");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root, encoding: "utf8" });
  // Introduce a tracked dirty? No — leave clean so mutation detection is clear.
  return root;
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "../../..");
  loadEnvLocal(repoRoot);

  // Force review model for this smoke regardless of ambient Auto.
  process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL = GROK_MODEL_ID;

  const mode = (process.env.FEATURE_SPRINT_RUNNER_MODE ?? "").trim().toLowerCase();
  if (mode === "mock" || mode === "") {
    exitBlocked("mock_mode", "HINT=Set FEATURE_SPRINT_RUNNER_MODE=cursor and start feature-runner:cursor");
  }

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

  const reviewModel = process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL?.trim();
  if (reviewModel !== GROK_MODEL_ID) {
    exitBlocked("review_model_not_configured", `expected=${GROK_MODEL_ID} actual=${reviewModel}`);
  }

  const fixtureRepo = createDisposableRepo();
  const baseline = gitStatusPorcelain(fixtureRepo);
  if (baseline) {
    exitFailed("fixture_not_clean", baseline);
  }

  const nonce = `LH_GROK_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const executionContext = {
    planId: "plan-smoke-grok",
    executionModel: "sprint_map" as const,
    sprintId: "sprint-grok-1",
    storyId: "story-grok-1",
    taskId: "task-grok-1",
    phase: "review" as const,
    stepId: "step-grok-1"
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
  const healthBody = (await health.json().catch(() => null)) as {
    ok?: boolean;
    mode?: string;
  } | null;
  if (!health.ok || !healthBody?.ok) {
    exitBlocked("runner_unhealthy", JSON.stringify(healthBody));
  }
  if (healthBody?.mode === "mock") {
    exitFailed("runner_in_mock_mode", JSON.stringify(healthBody));
  }

  console.log(`Posting cursor_review with model=${GROK_MODEL_ID} workspace=${fixtureRepo}...`);
  const promptMarkdown = [
    "# Feature Step Review Packet — Grok smoke",
    "",
    "## Review request",
    "Act as an independent, read-only critic.",
    "Do not edit files.",
    "Do not run destructive commands.",
    "Do not expand the approved scope.",
    "Report only evidence-backed findings.",
    "",
    "Respond with plain text that includes this exact nonce on its own line:",
    nonce,
    "",
    "Then include a fenced feature-review-verdict JSON block with status accepted",
    "and a short verdict mentioning the nonce.",
    "",
    "## Fixture diff context",
    "Changed files: (none — clean fixture)",
    "Diff: (empty)",
    "",
    "```feature-review-verdict",
    JSON.stringify(
      {
        status: "accepted",
        verdict: `Smoke review for ${nonce}`,
        followUps: []
      },
      null,
      2
    ),
    "```"
  ].join("\n");

  const response = await fetch(`${baseUrl}/feature-sprint/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      profile: "cursor_review",
      promptMarkdown,
      timeoutMs: 300_000,
      executionContext,
      // Disposable fixture repo — review runs against this cwd/workspace.
      repoPath: fixtureRepo
    })
  });

  const raw = await response.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    exitFailed("unreadable_response", raw.slice(0, 500));
  }

  const after = gitStatusPorcelain(fixtureRepo);
  console.log(`REQUESTED_MODEL=${String(parsed.requestedModel ?? "")}`);
  console.log(`RESOLVED_MODEL=${String(parsed.resolvedModel ?? "")}`);
  console.log(`MODEL_EVIDENCE_SOURCE=${String(parsed.modelEvidenceSource ?? "")}`);
  console.log(`RUNNER_MODE=${String(parsed.runnerMode ?? "")}`);
  console.log(`RESULT_USABILITY=${String(parsed.resultUsability ?? "")}`);
  console.log(`TERMINATION=${String(parsed.terminationReason ?? "")}`);
  console.log(`COMMAND_PREVIEW=${String(parsed.commandPreview ?? "").slice(0, 400)}`);
  console.log(`FIXTURE_MUTATION=${after ? "yes" : "no"}`);

  if (parsed.requestedModel !== GROK_MODEL_ID) {
    exitFailed(
      "requested_model_mismatch",
      JSON.stringify({
        expected: GROK_MODEL_ID,
        actual: parsed.requestedModel,
        commandPreview: parsed.commandPreview
      })
    );
  }

  const preview = typeof parsed.commandPreview === "string" ? parsed.commandPreview : "";
  if (!preview.includes("--model") || !preview.includes(GROK_MODEL_ID)) {
    exitFailed("model_not_in_command_preview", preview.slice(0, 600));
  }
  if (preview.includes("--force")) {
    exitFailed("review_received_force_flag", preview.slice(0, 600));
  }

  if (after) {
    exitFailed("readonly_mutation_detected", after);
  }

  if (parsed.terminationReason === "readonly_mutation") {
    exitFailed("runner_classified_readonly_mutation", raw.slice(0, 1200));
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
        outputPreview: outputText.slice(0, 600)
      })
    );
  }

  if (parsed.ok !== true) {
    exitFailed("runner_reported_not_ok", raw.slice(0, 1200));
  }

  if (parsed.runnerMode === "mock") {
    exitFailed("mock_result_rejected", JSON.stringify({ runnerMode: parsed.runnerMode }));
  }

  // Honest resolved-model reporting: success alone must not invent confirmation.
  if (
    parsed.resolvedModel !== undefined &&
    parsed.resolvedModel !== null &&
    parsed.modelEvidenceSource !== "cli_output" &&
    parsed.modelEvidenceSource !== "runner"
  ) {
    exitFailed(
      "resolved_model_without_evidence",
      JSON.stringify({
        resolvedModel: parsed.resolvedModel,
        modelEvidenceSource: parsed.modelEvidenceSource
      })
    );
  }

  console.log("SMOKE_STATUS=passed");
  console.log(`RUN_ID=${String(parsed.runId ?? "")}`);
  console.log(`PROVIDER=${String(parsed.provider ?? "")}`);
  console.log(`NONCE=${nonce}`);
  console.log(`FIXTURE_REPO=${fixtureRepo}`);
  console.log(
    `RESOLVED_MODEL_STATUS=${
      typeof parsed.resolvedModel === "string" && parsed.resolvedModel.trim()
        ? parsed.resolvedModel
        : "not confirmed by Cursor CLI"
    }`
  );
  console.log("NOTE=No automatic import/save/advance/complete/cleanup was invoked by this smoke.");
}

main().catch((error) => {
  exitFailed("uncaught", String(error));
});
