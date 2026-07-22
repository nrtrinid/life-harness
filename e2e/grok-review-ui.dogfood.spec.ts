/**
 * Opt-in UI smoke: completed implementation → Cursor review with Grok 4.5 high.
 *
 * Requires: npm run feature-runner:cursor (FEATURE_SPRINT_CURSOR_REVIEW_MODEL=cursor-grok-4.5-high)
 *
 * Run:
 *   $env:EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN=(token from runner .env.local)
 *   npx playwright test -c e2e/playwright.config.ts e2e/grok-review-ui.smoke.spec.ts --timeout=420000
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  getActiveFeatureSprintPlanForCard,
  importFeatureSprintPlanFromText,
  updateFeatureSprintStep
} from "../src/core/featureSprintOrchestrator";
import {
  createFeatureSprintFullLoopDogfoodState,
  FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT,
  FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID,
  FEATURE_SPRINT_FULL_LOOP_DOGFOOD_PLAN_BLOCK
} from "../src/dogfood/featureSprintFullLoopSeed";
import type { LifeHarnessData } from "../src/core/lifeHarnessData";
import { openFeatureSprintBackroom } from "./helpers/featureSprintBackroom";
import { seedWebDogfoodState } from "./helpers/webSeed";

const GROK_MODEL_ID = "cursor-grok-4.5-high";

function createDisposableRepo(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "lh-grok-ui-smoke-"));
  execFileSync("git", ["init"], { cwd: root, encoding: "utf8" });
  execFileSync("git", ["config", "user.email", "smoke@life-harness.local"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Life Harness Smoke"], { cwd: root });
  writeFileSync(path.join(root, "README.md"), "# Grok UI review smoke fixture\n", "utf8");
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(
    path.join(root, "src", "add.ts"),
    "export function add(a: number, b: number) {\n  return a + b;\n}\n",
    "utf8"
  );
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root, encoding: "utf8" });
  return root;
}

function gitStatusPorcelain(cwd: string): string {
  return execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim();
}

function createCompletedImplementationState(repoPath: string): LifeHarnessData {
  let state = createFeatureSprintFullLoopDogfoodState();
  const project = state.projects.find((item) => item.cardId === FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID);
  if (!project) {
    throw new Error("Missing dogfood project.");
  }
  state = {
    ...state,
    projects: state.projects.map((item) =>
      item.id === project.id
        ? {
            ...item,
            repoPath,
            defaultRunnerAgent: "cursor" as const,
            updatedAt: item.updatedAt
          }
        : item
    )
  };

  const imported = importFeatureSprintPlanFromText(
    state,
    FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID,
    FEATURE_SPRINT_FULL_LOOP_DOGFOOD_PLAN_BLOCK
  );
  if (!imported.ok) {
    throw new Error(imported.error);
  }
  state = imported.state;

  const plan = getActiveFeatureSprintPlanForCard(state, FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID);
  const stepId = plan?.currentStepId;
  if (!plan || !stepId) {
    throw new Error("Missing plan step after import.");
  }

  const saved = updateFeatureSprintStep(state, plan.id, stepId, {
    outputSummary: FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT,
    status: "sent"
  });
  if (!saved.ok) {
    throw new Error(saved.error);
  }
  return saved.state;
}

test.describe("Grok 4.5 high Cursor review UI smoke", () => {
  test("review shows requested model, honest unresolved identity, imports verdict, no mutation", async ({
    page
  }) => {
    test.setTimeout(420_000);

    const token = process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN?.trim();
    test.skip(!token, "EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN required for live runner UI smoke");

    const fixtureRepo = createDisposableRepo();
    const before = gitStatusPorcelain(fixtureRepo);
    expect(before).toBe("");

    await seedWebDogfoodState(page, createCompletedImplementationState(fixtureRepo));
    await openFeatureSprintBackroom(page, FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID);

    // Select Cursor (may already be default from project metadata).
    const cursorToggle = page.getByText("Cursor", { exact: true }).first();
    await cursorToggle.scrollIntoViewIfNeeded();
    await cursorToggle.click();

    await expect(page.getByText("Run review with Cursor", { exact: true })).toBeVisible();

    // Probe runner so Cursor availability guard is satisfied.
    const checkRunner = page.getByText("Check runner", { exact: true });
    await checkRunner.scrollIntoViewIfNeeded();
    await checkRunner.click();
    await expect(page.getByText(/Cursor ready|available|Runner looks ready/i).first()).toBeVisible({
      timeout: 20_000
    });

    await page.getByText("Run review with Cursor", { exact: true }).click();
    await expect(page.getByText("Running…")).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(/Review output ready\. Click Import review verdict\./).first()).toBeVisible({
      timeout: 360_000
    });
    await expect(page.getByText(/Cursor review · succeeded/i).first()).toBeVisible({ timeout: 60_000 });

    // Completed runs auto-select; expand details if still collapsed.
    const viewDetails = page.getByText("View details", { exact: true }).first();
    if (await viewDetails.isVisible().catch(() => false)) {
      await viewDetails.click();
    }

    await expect(page.getByText(`Requested model: ${GROK_MODEL_ID}`, { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("Resolved model: not confirmed by Cursor CLI", { exact: true }).first()
    ).toBeVisible();

    // Output should have landed in agent/review import path — use Import review verdict after wrap if needed.
    const reviewImport = page.getByTestId("feature-sprint-review-import-input");
    await reviewImport.scrollIntoViewIfNeeded();
    const importValue = await reviewImport.inputValue();
    expect(importValue.trim().length).toBeGreaterThan(0);

    if (!importValue.includes("```feature-review-verdict")) {
      await page.getByText("Wrap as verdict block", { exact: true }).click();
      await expect(page.getByText(/Wrapped output in a feature-review-verdict block/i).first()).toBeVisible();
    }

    await page.getByTestId("feature-sprint-import-review-verdict").click();
    await expect(page.getByText("Review verdict imported.").first()).toBeVisible({ timeout: 30_000 });

    const after = gitStatusPorcelain(fixtureRepo);
    expect(after).toBe("");
  });
});
