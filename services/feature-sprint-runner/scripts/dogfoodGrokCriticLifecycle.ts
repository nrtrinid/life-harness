/**
 * Full Feature Sprint dogfood: Cursor Auto implementation → Grok 4.5 review → cleanup.
 *
 * Uses the Life Harness runner HTTP path (not pasting prompts into Cursor Chat).
 *
 * Prerequisites:
 *   - npm run feature-runner:cursor (this worktree, with REVIEW_MODEL set)
 *   - FEATURE_SPRINT_CURSOR_REVIEW_MODEL=cursor-grok-4.5-high in runner .env.local
 *
 * Usage:
 *   npx tsx services/feature-sprint-runner/scripts/dogfoodGrokCriticLifecycle.ts
 *
 * Exit: 0 pass, 1 fail, 2 blocked
 */
import { existsSync, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  createFeatureSprintRunnerRun,
  completeFeatureSprintRunnerRun,
  markFeatureSprintRunnerRunImported,
  markFeatureSprintRunnerRunWorktreeCleanup
} from "../../../src/core/featureSprintRunnerHistory";
import { parseFeatureReviewVerdictBlock } from "../../../src/core/featureSprintOrchestrator";
import { createSeedState } from "../../../src/data/createSeedState";
import type { LifeHarnessData } from "../../../src/core/lifeHarnessData";
import type {
  FeatureSprintRunnerResponse,
  FeatureSprintWorktreeCleanupStatus
} from "../../../src/core/featureSprintRunner";

const GROK_MODEL_ID = "cursor-grok-4.5-high";
const FRICTION: Array<{ class: string; note: string }> = [];

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
  console.log("DOGFOOD_STATUS=blocked");
  console.log(`BLOCKER=${blocker}`);
  if (detail) {
    console.log(detail);
  }
  process.exit(2);
}

function exitFailed(blocker: string, detail?: string): never {
  console.log("DOGFOOD_STATUS=failed");
  console.log(`BLOCKER=${blocker}`);
  if (detail) {
    console.log(detail);
  }
  dumpFriction();
  process.exit(1);
}

function dumpFriction(): void {
  console.log("--- FRICTION LOG ---");
  if (FRICTION.length === 0) {
    console.log("(none)");
    return;
  }
  for (const row of FRICTION) {
    console.log(`${row.class}: ${row.note}`);
  }
}

function noteFriction(classification: string, note: string): void {
  FRICTION.push({ class: classification, note });
  console.log(`FRICTION[${classification}] ${note}`);
}

async function postJson(
  baseUrl: string,
  token: string,
  route: string,
  body: unknown,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const url = new URL(`${baseUrl}${route}`);
  const payload = Buffer.from(JSON.stringify(body), "utf8");

  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": payload.byteLength
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(JSON.parse(raw) as Record<string, unknown>);
          } catch {
            reject(new Error(`Unreadable response (${res.statusCode}): ${raw.slice(0, 400)}`));
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms for ${route}`));
    });
    req.on("error", (error) => {
      reject(new Error(`http failed for ${route}: ${String(error)}`));
    });
    req.write(payload);
    req.end();
  });
}

function buildImplementationPrompt(nonce: string): string {
  return [
    "# Feature Sprint Implementation Packet — Honest MVD recovery visibility",
    "",
    "## Approved task",
    "Objective: Add focused unit tests for computeRecoveryVisibility and make mvdProgress explicitly non-authoritative.",
    `Nonce (include in a short summary comment or test name somewhere): ${nonce}`,
    "",
    "## Sprint Map identity",
    "- Sprint: Grok Critic Readiness / dogfood slice",
    "- Story: Prove Auto implementation + Grok review lifecycle",
    "- Task: Honest MVD recovery visibility + focused tests",
    "- Phase: implement",
    "",
    "## Allowed scope",
    "- src/core/recovery.ts",
    "- src/core/recovery.test.ts (create)",
    "- src/core/types.ts only if clarifying mvdProgress honesty",
    "",
    "## Forbidden scope",
    "- UI / app / components",
    "- nextMoveContract / context packet schemas",
    "- Inventing real MVD checklist persistence",
    "- Anthropic gateway / unrelated files",
    "",
    "## Acceptance criteria",
    "1. src/core/recovery.test.ts covers salvage promote, evening MVD, afternoon no-MVD, completed MVD no promote.",
    "2. mvdProgress is clearly labeled as placeholder / not tracked (comment and/or tracked:false field).",
    "3. showMvd / showSalvage / shouldPromote semantics unchanged.",
    "4. Keep changes minimal.",
    "",
    "## Architecture constraints",
    "- src/core stays UI-independent.",
    "- Do not invent product concepts.",
    "",
    "## Verification",
    "Prefer: npx vitest run src/core/recovery.test.ts",
    "",
    "Implement only inside the assigned workspace/worktree. Do not commit or push."
  ].join("\n");
}

function buildReviewPrompt(
  nonce: string,
  implementationSummary: string,
  changedFiles: string[],
  diffText: string | undefined,
  verificationSummary: string
): string {
  return [
    "# Feature Step Review Packet — Honest MVD recovery visibility",
    "",
    "## Approved task objective",
    "Add focused recovery visibility tests and make mvdProgress explicitly non-authoritative.",
    "",
    "## Sprint/story/task identity",
    "- Sprint: Grok Critic Readiness",
    "- Story: Grok critic lifecycle dogfood",
    "- Task: Honest MVD recovery visibility + focused tests",
    `- Phase: review`,
    `- Nonce: ${nonce}`,
    "",
    "## Allowed and forbidden scope",
    "Allowed: src/core/recovery.ts, src/core/recovery.test.ts, optional honesty clarifications in types.ts.",
    "Forbidden: UI, gateway, packet schema expansion, inventing checklist persistence.",
    "",
    "## Acceptance criteria",
    "Focused tests exist; mvdProgress honesty; visibility semantics unchanged.",
    "",
    "## Changed files",
    ...(changedFiles.length ? changedFiles.map((f) => `- ${f}`) : ["- (none reported)"]),
    "",
    "## Diff",
    "```diff",
    (diffText?.trim() || "(no diff captured)").slice(0, 12_000),
    "```",
    "",
    "## Verification results",
    verificationSummary,
    "",
    "## Implementation summary",
    implementationSummary.slice(0, 4_000),
    "",
    "## Architecture constraints",
    "src/core UI-independent; smallest change; no new product concepts.",
    "",
    "## Known deviations",
    "(none declared)",
    "",
    "## Review request",
    "Act as an independent, read-only critic.",
    "Do not edit files.",
    "Do not run destructive commands.",
    "Do not expand the approved scope.",
    "Report only evidence-backed findings.",
    "Do not manufacture findings to appear thorough.",
    "Distinguish defects from optional improvements.",
    "Recommend the smallest safe correction.",
    "Return the existing feature-review-verdict format.",
    `Include the nonce ${nonce} somewhere in the verdict prose.`,
    "",
    "## Required fenced verdict block",
    "```feature-review-verdict",
    JSON.stringify(
      {
        status: "accepted",
        verdict: "...",
        nextPrompt: "...",
        followUps: ["..."]
      },
      null,
      2
    ),
    "```"
  ].join("\n");
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "../../..");
  loadEnvLocal(repoRoot);

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
  if (process.env.FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION !== "1") {
    exitBlocked("FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION");
  }
  if (process.env.FEATURE_SPRINT_CURSOR_REVIEW_MODEL?.trim() !== GROK_MODEL_ID) {
    exitBlocked(
      "review_model_not_configured_on_runner_env",
      `expected FEATURE_SPRINT_CURSOR_REVIEW_MODEL=${GROK_MODEL_ID}`
    );
  }

  const baseUrl = (process.env.FEATURE_SPRINT_RUNNER_BASE_URL ?? "http://127.0.0.1:8127").replace(
    /\/$/,
    ""
  );

  let health: Response;
  try {
    health = await fetch(`${baseUrl}/health`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    exitBlocked("runner_unreachable", "HINT=npm run feature-runner:cursor");
  }
  const healthBody = (await health.json().catch(() => null)) as { ok?: boolean; mode?: string } | null;
  if (!health.ok || !healthBody?.ok) {
    exitBlocked("runner_unhealthy", JSON.stringify(healthBody));
  }
  if (healthBody?.mode === "mock") {
    exitFailed("runner_in_mock_mode");
  }

  const nonce = `LH_DOGFOOD_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const cardId = "card-grok-dogfood";
  const planId = "plan-grok-dogfood";
  const stepId = "step-grok-dogfood";
  const now = new Date().toISOString();

  let state: LifeHarnessData = {
    ...createSeedState(now),
    cards: [
      {
        id: cardId,
        title: "Grok critic dogfood",
        area: "build",
        state: "active",
        progress: 10,
        warmth: "hot",
        whyItMatters: "Prove Grok review routing.",
        nextTinyAction: "Run recovery honesty task.",
        doneForNow: "",
        doLane: "Implement recovery tests.",
        improveLane: "Do not invent checklist persistence.",
        recentWins: [],
        openLoops: [],
        optimizationIdeas: [],
        proofItemIds: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    featureSprintPlans: [
      {
        id: planId,
        cardId,
        title: "Grok Critic Readiness dogfood",
        goal: "Honest MVD recovery visibility + focused tests",
        status: "active",
        acceptanceCriteria: [
          "recovery.test.ts covers salvage/evening/afternoon/completed cases",
          "mvdProgress is explicitly non-authoritative"
        ],
        nonGoals: ["UI changes", "Checklist persistence"],
        constraints: ["src/core only", "No Anthropic gateway files"],
        steps: [
          {
            id: stepId,
            title: "Honest MVD recovery visibility",
            goal: "Add tests and honesty labeling for mvdProgress",
            acceptanceCriteria: [
              "Focused recovery tests",
              "Placeholder mvdProgress labeled honestly"
            ],
            status: "ready",
            createdAt: now,
            updatedAt: now
          }
        ],
        currentStepId: stepId,
        createdAt: now,
        updatedAt: now
      }
    ]
  };

  console.log("=== PHASE: Cursor Auto/default implementation ===");
  const implCreated = createFeatureSprintRunnerRun(state, {
    profile: "cursor_implementation",
    cardId,
    planId,
    stepId,
    startedAt: now
  });
  if (!implCreated.ok) {
    exitFailed("create_implementation_run", implCreated.error);
  }
  state = implCreated.state;

  const implResponse = await postJson(
    baseUrl,
    token,
    "/feature-sprint/run",
    {
      profile: "cursor_implementation",
      promptMarkdown: buildImplementationPrompt(nonce),
      repoPath: repoRoot,
      timeoutMs: 900_000,
      worktree: { enabled: true },
      runVerification: true,
      verificationCommands: ["npx vitest run src/core/recovery.test.ts"],
      executionContext: {
        planId,
        executionModel: "sprint_map",
        sprintId: "sprint-grok-critic",
        storyId: "story-recovery-honesty",
        taskId: "task-recovery-tests",
        phase: "implement",
        stepId
      }
    },
    920_000
  );

  console.log(`IMPL_OK=${String(implResponse.ok)}`);
  console.log(`IMPL_REQUESTED_MODEL=${String(implResponse.requestedModel ?? "")}`);
  console.log(`IMPL_RESOLVED_MODEL=${String(implResponse.resolvedModel ?? "")}`);
  console.log(`IMPL_COMMAND_PREVIEW=${String(implResponse.commandPreview ?? "").slice(0, 500)}`);
  console.log(`IMPL_WORKTREE=${String(implResponse.worktreePath ?? "")}`);
  console.log(`IMPL_CHANGED=${JSON.stringify(implResponse.changedFiles ?? [])}`);
  console.log(`IMPL_USABILITY=${String(implResponse.resultUsability ?? "")}`);

  if (implResponse.runnerMode === "mock") {
    exitFailed("implementation_mock_mode");
  }

  const implRequested = typeof implResponse.requestedModel === "string" ? implResponse.requestedModel : "";
  if (implRequested === GROK_MODEL_ID || String(implResponse.commandPreview ?? "").includes(GROK_MODEL_ID)) {
    exitFailed("implementation_inherited_grok_review_model", String(implResponse.commandPreview ?? ""));
  }

  const implCompleted = completeFeatureSprintRunnerRun(
    state,
    implCreated.runId,
    implResponse as unknown as FeatureSprintRunnerResponse,
    new Date().toISOString()
  );
  if (!implCompleted.ok) {
    exitFailed("complete_implementation_run", implCompleted.error);
  }
  state = implCompleted.state;

  // Manual save gate (simulated): mark imported only after a usable implementation result.
  if (implResponse.ok === true) {
    const implImported = markFeatureSprintRunnerRunImported(state, implCreated.runId);
    if (!implImported.ok) {
      exitFailed("import_implementation_run", implImported.error);
    }
    state = implImported.state;
    console.log("MANUAL_GATE=implementation_saved");
  }

  if (implResponse.ok !== true) {
    noteFriction("BLOCKER", `Implementation not ok: ${String(implResponse.error ?? implResponse.diagnosticMessage)}`);
    exitFailed("implementation_failed", JSON.stringify({
      error: implResponse.error,
      diagnosticMessage: implResponse.diagnosticMessage,
      outputPreview: String(implResponse.outputText ?? "").slice(0, 800)
    }));
  }

  const worktreePath =
    typeof implResponse.worktreePath === "string" ? implResponse.worktreePath : "";
  if (!worktreePath) {
    exitFailed("missing_implementation_worktree");
  }

  console.log("=== PHASE: Cursor Grok 4.5 review (manual phase switch) ===");
  const reviewCreated = createFeatureSprintRunnerRun(state, {
    profile: "cursor_review",
    cardId,
    planId,
    stepId,
    startedAt: new Date().toISOString()
  });
  if (!reviewCreated.ok) {
    exitFailed("create_review_run", reviewCreated.error);
  }
  state = reviewCreated.state;

  const changedFiles = Array.isArray(implResponse.changedFiles)
    ? implResponse.changedFiles.filter((f): f is string => typeof f === "string")
    : [];
  const verificationSummary = Array.isArray(implResponse.verificationResults)
    ? JSON.stringify(implResponse.verificationResults).slice(0, 2000)
    : "(none)";

  const reviewResponse = await postJson(
    baseUrl,
    token,
    "/feature-sprint/run",
    {
      profile: "cursor_review",
      promptMarkdown: buildReviewPrompt(
        nonce,
        String(implResponse.outputText ?? ""),
        changedFiles,
        typeof implResponse.diffText === "string" ? implResponse.diffText : undefined,
        verificationSummary
      ),
      repoPath: worktreePath,
      timeoutMs: 600_000,
      executionContext: {
        planId,
        executionModel: "sprint_map",
        sprintId: "sprint-grok-critic",
        storyId: "story-recovery-honesty",
        taskId: "task-recovery-tests",
        phase: "review",
        stepId
      }
    },
    620_000
  );

  console.log(`REVIEW_OK=${String(reviewResponse.ok)}`);
  console.log(`REVIEW_REQUESTED_MODEL=${String(reviewResponse.requestedModel ?? "")}`);
  console.log(`REVIEW_RESOLVED_MODEL=${String(reviewResponse.resolvedModel ?? "")}`);
  console.log(`REVIEW_MODEL_EVIDENCE=${String(reviewResponse.modelEvidenceSource ?? "")}`);
  console.log(`REVIEW_COMMAND_PREVIEW=${String(reviewResponse.commandPreview ?? "").slice(0, 500)}`);
  console.log(`REVIEW_USABILITY=${String(reviewResponse.resultUsability ?? "")}`);
  console.log(`REVIEW_TERMINATION=${String(reviewResponse.terminationReason ?? "")}`);

  if (reviewResponse.requestedModel !== GROK_MODEL_ID) {
    noteFriction("BLOCKER", "Review model unexpectedly not selected");
    exitFailed("review_model_not_selected", String(reviewResponse.commandPreview ?? ""));
  }
  if (!String(reviewResponse.commandPreview ?? "").includes(`--model ${GROK_MODEL_ID}`)) {
    exitFailed("review_model_missing_from_preview", String(reviewResponse.commandPreview ?? ""));
  }
  if (String(reviewResponse.commandPreview ?? "").includes("--force")) {
    exitFailed("review_received_force_flag");
  }
  if (reviewResponse.terminationReason === "readonly_mutation") {
    noteFriction("SAFETY", "Review mutation detected");
    exitFailed("review_readonly_mutation");
  }
  if (!reviewResponse.resolvedModel) {
    noteFriction(
      "REPEATED_FRICTION",
      "Resolved model not confirmed by Cursor CLI (text output); requested model preserved honestly"
    );
  }

  const reviewOutput = typeof reviewResponse.outputText === "string" ? reviewResponse.outputText : "";
  if (!reviewOutput.trim()) {
    exitFailed("review_empty_output");
  }
  if (!reviewOutput.includes(nonce)) {
    noteFriction("POLISH", "Review prose omitted dogfood nonce");
  }

  const typed = parseFeatureReviewVerdictBlock(reviewOutput);
  if (!typed) {
    noteFriction(
      "REPEATED_FRICTION",
      "Review prose without valid feature-review-verdict fence — manual Wrap/import recovery path required"
    );
    console.log("TYPED_VERDICT=missing");
    console.log(`REVIEW_OUTPUT_PREVIEW=${reviewOutput.slice(0, 1200)}`);
  } else {
    console.log(`TYPED_VERDICT=ok status=${typed.status}`);
    console.log(`TYPED_VERDICT_BODY=${typed.verdict.slice(0, 400)}`);
  }

  const reviewCompleted = completeFeatureSprintRunnerRun(
    state,
    reviewCreated.runId,
    reviewResponse as unknown as FeatureSprintRunnerResponse,
    new Date().toISOString()
  );
  if (!reviewCompleted.ok) {
    exitFailed("complete_review_run", reviewCompleted.error);
  }
  state = reviewCompleted.state;

  // Manual typed-verdict import gate (only when fence present).
  if (typed) {
    const reviewImported = markFeatureSprintRunnerRunImported(state, reviewCreated.runId);
    if (!reviewImported.ok) {
      exitFailed("import_review_run", reviewImported.error);
    }
    state = reviewImported.state;
    console.log("MANUAL_GATE=typed_verdict_imported");
  } else {
    console.log("MANUAL_GATE=typed_verdict_skipped_prose_only");
  }

  if (reviewResponse.ok !== true) {
    exitFailed("review_not_ok", JSON.stringify({
      error: reviewResponse.error,
      diagnosticMessage: reviewResponse.diagnosticMessage
    }));
  }

  console.log("=== PHASE: Product cleanup ===");
  const cleanup = await postJson(
    baseUrl,
    token,
    "/feature-sprint/cleanup-worktree",
    {
      worktreePath,
      repoPath: repoRoot,
      force: false
    },
    180_000
  );

  console.log(`CLEANUP_OK=${String(cleanup.ok)}`);
  console.log(`CLEANUP_STATUS=${String(cleanup.status ?? "")}`);
  console.log(`CLEANUP_MESSAGE=${String(cleanup.message ?? "").slice(0, 400)}`);

  if (cleanup.ok !== true && cleanup.status === "blocked") {
    noteFriction("REPEATED_FRICTION", "Normal cleanup blocked (dirty worktree); attempting Force clean");
    const forceCleanup = await postJson(
      baseUrl,
      token,
      "/feature-sprint/cleanup-worktree",
      {
        worktreePath,
        repoPath: repoRoot,
        force: true
      },
      900_000
    );
    console.log(`FORCE_CLEANUP_OK=${String(forceCleanup.ok)}`);
    console.log(`FORCE_CLEANUP_STATUS=${String(forceCleanup.status ?? "")}`);
    console.log(`FORCE_CLEANUP_MESSAGE=${String(forceCleanup.message ?? "").slice(0, 400)}`);
    Object.assign(cleanup, forceCleanup);
  }

  const cleanupMarked = markFeatureSprintRunnerRunWorktreeCleanup(
    state,
    implCreated.runId,
    {
      ok: cleanup.ok === true,
      status: (typeof cleanup.status === "string"
        ? cleanup.status
        : "failed") as FeatureSprintWorktreeCleanupStatus,
      worktreePath,
      message: typeof cleanup.message === "string" ? cleanup.message : undefined,
      startedAt: typeof cleanup.startedAt === "string" ? cleanup.startedAt : new Date().toISOString(),
      completedAt: typeof cleanup.completedAt === "string" ? cleanup.completedAt : new Date().toISOString()
    },
    new Date().toISOString()
  );
  if (cleanupMarked.ok) {
    state = cleanupMarked.state;
  }

  let worktreeGone = false;
  try {
    await access(worktreePath);
    worktreeGone = false;
  } catch {
    worktreeGone = true;
  }
  console.log(`WORKTREE_FS_GONE=${worktreeGone ? "yes" : "no"}`);

  if (cleanup.ok !== true && cleanup.status !== "cleaned" && cleanup.status !== "not_found") {
    noteFriction("BLOCKER", `Cleanup did not complete: ${String(cleanup.status)}`);
    exitFailed("cleanup_incomplete", JSON.stringify(cleanup).slice(0, 800));
  }

  console.log("DOGFOOD_STATUS=passed");
  console.log(`NONCE=${nonce}`);
  console.log(`IMPL_RUN_ID=${implCreated.runId}`);
  console.log(`REVIEW_RUN_ID=${reviewCreated.runId}`);
  console.log(`IMPL_REQUESTED_MODEL_FINAL=${implRequested || "(unset/Auto)"}`);
  console.log(`REVIEW_REQUESTED_MODEL_FINAL=${String(reviewResponse.requestedModel)}`);
  console.log(
    `REVIEW_RESOLVED_MODEL_FINAL=${
      typeof reviewResponse.resolvedModel === "string" && reviewResponse.resolvedModel.trim()
        ? reviewResponse.resolvedModel
        : "not confirmed by Cursor CLI"
    }`
  );
  console.log("MANUAL_GATES=implementation_save,phase_switch_review,verdict_import,complete,cleanup");
  dumpFriction();
}

main().catch((error) => {
  exitFailed("uncaught", String(error));
});
