import { expect, test } from "@playwright/test";
import path from "node:path";

import {
  createDurableLaunchReadyDogfoodState,
  FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_CARD_ID,
  FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_PLAN_ID,
  FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID
} from "../src/dogfood/featureSprintDurableLaunchSeed";
import { openFeatureSprintBackroom } from "./helpers/featureSprintBackroom";
import {
  armHangNextRunResponse,
  captureRunPostBodies,
  getAttemptStatusFromRunner,
  getRunnerTestMetrics,
  resetRunnerTestMetrics
} from "./helpers/featureSprintRunnerProbe";
import { seedWebDogfoodStatePreserveAcrossReload } from "./helpers/webSeed";

test.describe("Feature Sprint durable kernel launch dogfood", () => {
  test("launches via kernel, recovers after refresh, resume-applies once, then normalizes proof", async ({
    page
  }) => {
    test.setTimeout(420_000);
    const repoPath = path.resolve(__dirname, "..");
    const seed = createDurableLaunchReadyDogfoodState({ repoPath });
    expect(seed.nextAction).toBe("launch_implementation");

    // Refresh-after-success recovery: response arrives, then reload before Check status.
    // Hang-next transport-loss repair is covered by a sibling test in this file.
    await resetRunnerTestMetrics();
    const interception = captureRunPostBodies(page);

    await seedWebDogfoodStatePreserveAcrossReload(page, seed.state);
    await openFeatureSprintBackroom(page, FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_CARD_ID);

    await expect(page.getByText("Next legal action", { exact: true })).toBeVisible();
    await expect(page.getByText("Kernel-managed", { exact: true })).toBeVisible();
    await expect(page.getByText("Action: launch_implementation", { exact: true })).toBeVisible();

    const launchButton = page.getByRole("button", { name: "Launch Launch implementation" });
    await launchButton.scrollIntoViewIfNeeded();
    await expect(launchButton).toBeVisible();

    // Single UI launch click (duplicate protection is covered by the durable mutex + spawnCount=1).
    await launchButton.click({ force: true });

    await expect(page.getByText("Durable execution attempt", { exact: true })).toBeVisible({
      timeout: 120_000
    });
    await expect.poll(async () => interception.capturedAttemptIds.length, { timeout: 120_000 }).toBeGreaterThan(0);
    const attemptId = interception.capturedAttemptIds[0];
    expect(attemptId).toBeTruthy();
    await expect.poll(async () => (await getRunnerTestMetrics()).spawnCount, { timeout: 120_000 }).toBe(1);
    expect(interception.runPostRequests).toHaveLength(1);
    await expect
      .poll(async () => (await getAttemptStatusFromRunner(attemptId!)).status, { timeout: 120_000 })
      .toBe("completed");
    await expect(page.getByText(attemptId!, { exact: false })).toBeVisible();
    await expect(page.getByText(/· response_received|· reconciled/, { exact: false })).toBeVisible({
      timeout: 60_000
    });

    const postBody = interception.runPostRequests[0]?.postDataJSON() as {
      attemptId?: string;
      attemptBinding?: {
        planId?: string;
        taskId?: string;
        phase?: string;
        profile?: string;
        actionId?: string;
        stateRevision?: number;
      };
      cardId?: string;
      planId?: string;
    };
    expect(postBody.attemptId).toBe(attemptId);
    expect(postBody.cardId).toBe(FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_CARD_ID);
    expect(postBody.planId).toBe(FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_PLAN_ID);
    expect(postBody.attemptBinding?.planId).toBe(FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_PLAN_ID);
    expect(postBody.attemptBinding?.taskId).toBe(FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID);
    expect(postBody.attemptBinding?.phase).toBe("implement");
    expect(postBody.attemptBinding?.profile).toBe("codex_implementation");
    expect(postBody.attemptBinding?.actionId).toContain("launch_implementation");
    expect(typeof postBody.attemptBinding?.stateRevision).toBe("number");

    // Refresh must restore the open attempt and must not relaunch.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("card-detail-mode-backroom").click();
    await page.getByTestId("card-backroom-sprint-metadata").click();
    await expect(page.getByText("Durable execution attempt", { exact: true })).toBeVisible();
    await expect(page.getByText(attemptId!, { exact: false })).toBeVisible();
    await expect(page.getByText("Check runner status", { exact: true })).toBeVisible();

    const metricsBeforeRecover = await getRunnerTestMetrics();
    expect(metricsBeforeRecover.spawnCount).toBe(1);

    const statusResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes(`/feature-sprint/attempts/${attemptId}`)
    );

    const checkButton = page.getByText("Check runner status", { exact: true });
    await checkButton.scrollIntoViewIfNeeded();
    await checkButton.click({ force: true });
    await statusResponsePromise;

    await expect(
      page.getByText("Retrieved persisted runner result for this attempt. No provider relaunch.", {
        exact: true
      })
    ).toBeVisible({ timeout: 10_000 });

    const runPostsDuringRecover: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/feature-sprint/run")) {
        runPostsDuringRecover.push(request.url());
      }
    });

    await page.getByText("Resume apply result", { exact: true }).click();
    await expect(
      page.getByText(
        "Loaded persisted attempt result into the output field. Save, then Normalize proof. No provider relaunch.",
        { exact: true }
      )
    ).toBeVisible();
    expect(runPostsDuringRecover).toEqual([]);

    const output = page.getByTestId("feature-sprint-agent-output-input");
    await expect(output).not.toHaveValue("");

    await page.getByTestId("feature-sprint-save-agent-output").click();
    await expect(page.getByText("Feature sprint step updated.", { exact: true })).toBeVisible();

    // Product fix: durable create/complete must keep runner history available for proof.
    await expect(page.getByText("No runner history yet.")).toHaveCount(0);
    await expect(page.getByText("Changed files: 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Changed files: 1 — .life-harness/mock-implementation-result.md").first()).toBeVisible();
    await expect(page.getByText(/status: passed/).first()).toBeVisible();

    await expect(page.getByText("Action: save_implementation_proof", { exact: true })).toBeVisible();
    // RN web exposes this Pressable as generic text, not role=button.
    const normalizeButton = page.getByText("Normalize for review", { exact: true });
    await normalizeButton.scrollIntoViewIfNeeded();
    await normalizeButton.click({ force: true });

    await expect(
      page.getByText("Saved validated implementation proof.", { exact: true })
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText("Action: launch_review", { exact: true })).toBeVisible({
      timeout: 30_000
    });
    await expect(page.getByRole("button", { name: "Launch Launch review" })).toBeVisible();

    const finalMetrics = await getRunnerTestMetrics();
    expect(finalMetrics.spawnCount).toBe(1);
    expect(finalMetrics.lastAttemptId).toBe(attemptId);
  });

  test("hang-next transport loss: Check status repairs history then normalizes to launch_review", async ({
    page
  }) => {
    test.setTimeout(420_000);
    const repoPath = path.resolve(__dirname, "..");
    const seed = createDurableLaunchReadyDogfoodState({ repoPath });
    expect(seed.nextAction).toBe("launch_implementation");

    await resetRunnerTestMetrics();
    const interception = captureRunPostBodies(page);

    await seedWebDogfoodStatePreserveAcrossReload(page, seed.state);
    await openFeatureSprintBackroom(page, FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_CARD_ID);

    await expect(page.getByText("Action: launch_implementation", { exact: true })).toBeVisible();

    // Arm immediately before the UI launch so nothing else can consume the one-shot flag.
    await armHangNextRunResponse();

    const launchButton = page.getByRole("button", { name: "Launch Launch implementation" });
    await launchButton.scrollIntoViewIfNeeded();
    await launchButton.click({ force: true });

    await expect(page.getByText("Durable execution attempt", { exact: true })).toBeVisible({
      timeout: 120_000
    });
    await expect.poll(async () => interception.capturedAttemptIds.length, { timeout: 120_000 }).toBe(1);
    const attemptId = interception.capturedAttemptIds[0];
    expect(attemptId).toBeTruthy();
    expect(interception.runPostRequests).toHaveLength(1);

    await expect.poll(async () => (await getRunnerTestMetrics()).spawnCount, { timeout: 120_000 }).toBe(1);
    await expect
      .poll(async () => (await getAttemptStatusFromRunner(attemptId!)).status, { timeout: 120_000 })
      .toBe("completed");
    await expect
      .poll(async () => (await getAttemptStatusFromRunner(attemptId!)).resultOk, { timeout: 30_000 })
      .toBe(true);

    // Browser response was destroyed; attempt remains open for Check status (may still be
    // running while the hung POST awaits, or already ambiguous/failed after transport loss).
    await expect(page.getByText("Durable execution attempt", { exact: true })).toBeVisible();
    await expect(page.getByText(attemptId!, { exact: false })).toBeVisible();
    // Must not look like a normal successful launch response was applied yet.
    await expect(
      page.getByText("Implementation finished. Inspect the expanded run above, then Save agent output.", {
        exact: true
      })
    ).toHaveCount(0);

    const metricsBeforeRecover = await getRunnerTestMetrics();
    expect(metricsBeforeRecover.spawnCount).toBe(1);
    expect(metricsBeforeRecover.postCount).toBe(1);

    const statusGets: string[] = [];
    const runPostsAfterLaunch: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "GET" && request.url().includes("/feature-sprint/attempts/")) {
        statusGets.push(request.url());
      }
      if (request.method() === "POST" && request.url().includes("/feature-sprint/run")) {
        runPostsAfterLaunch.push(request.url());
      }
    });

    const checkButton = page.getByText("Check runner status", { exact: true });
    await checkButton.scrollIntoViewIfNeeded();
    await checkButton.click({ force: true });
    await expect
      .poll(async () => statusGets.some((url) => url.includes(attemptId!)), { timeout: 30_000 })
      .toBe(true);
    await expect(
      page.getByText(
        "Recovered journaled implementation success after transport loss. Local runner history repaired. No provider relaunch.",
        { exact: true }
      )
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(`${attemptId} · response_received`, { exact: false })).toBeVisible();
    await expect(page.getByText(/Codex implementation · succeeded ·/, { exact: false })).toBeVisible();
    await expect(page.getByText("Changed files: 1", { exact: true })).toBeVisible();
    const viewDetails = page.getByText("View details", { exact: true }).first();
    if (await viewDetails.count()) {
      await viewDetails.click({ force: true });
    }
    await expect(page.getByText(".life-harness/mock-implementation-result.md", { exact: false }).first()).toBeVisible({
      timeout: 30_000
    });
    await expect(page.getByText(/status: passed|Verification: 1 passed/, { exact: false }).first()).toBeVisible();

    // Repeated Check status must be idempotent (GET only; no duplicate history/evidence).
    const getsBeforeRepeat = statusGets.length;
    await checkButton.click({ force: true });
    await expect.poll(async () => statusGets.length, { timeout: 30_000 }).toBeGreaterThan(getsBeforeRepeat);
    await expect(
      page.getByText("Retrieved persisted runner result for this attempt. No provider relaunch.", {
        exact: true
      })
    ).toBeVisible({ timeout: 30_000 });
    // Details pane may duplicate the summary line; history row count stays one.
    await expect(page.getByText("Changed files: 1", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Recent runner runs", { exact: true })).toBeVisible();
    await expect(page.getByText(/Codex implementation · succeeded ·/, { exact: false }).first()).toBeVisible();

    expect(runPostsAfterLaunch).toEqual([]);
    expect((await getRunnerTestMetrics()).spawnCount).toBe(1);
    expect((await getRunnerTestMetrics()).postCount).toBe(1);

    await page.getByText("Resume apply result", { exact: true }).click();
    await expect(
      page.getByText(
        "Loaded persisted attempt result into the output field. Save, then Normalize proof. No provider relaunch.",
        { exact: true }
      )
    ).toBeVisible();
    expect(runPostsAfterLaunch).toEqual([]);

    const output = page.getByTestId("feature-sprint-agent-output-input");
    await expect(output).not.toHaveValue("");

    await page.getByTestId("feature-sprint-save-agent-output").click();
    await expect(page.getByText("Feature sprint step updated.", { exact: true })).toBeVisible();

    await expect(page.getByText("Action: save_implementation_proof", { exact: true })).toBeVisible();
    const normalizeButton = page.getByText("Normalize for review", { exact: true });
    await normalizeButton.scrollIntoViewIfNeeded();
    await normalizeButton.click({ force: true });

    await expect(
      page.getByText("Saved validated implementation proof.", { exact: true })
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText("Action: launch_review", { exact: true })).toBeVisible({
      timeout: 30_000
    });
    await expect(page.getByText("Launch Launch review", { exact: true })).toBeVisible({
      timeout: 30_000
    });

    const finalMetrics = await getRunnerTestMetrics();
    expect(finalMetrics.spawnCount).toBe(1);
    expect(finalMetrics.postCount).toBe(1);
    expect(finalMetrics.lastAttemptId).toBe(attemptId);
    expect(interception.runPostRequests).toHaveLength(1);
    expect(runPostsAfterLaunch).toEqual([]);
  });
});
