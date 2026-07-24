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

    // Refresh-after-success recovery (not hang-next): lost HTTP response currently completes
    // local runner history as failed before Check status can attach the journaled success,
    // which blocks Normalize/proof. Hang control remains available for a product follow-up.
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

    const statusGets: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "GET" && request.url().includes("/feature-sprint/attempts/")) {
        statusGets.push(request.url());
      }
    });

    const checkButton = page.getByText("Check runner status", { exact: true });
    await checkButton.scrollIntoViewIfNeeded();
    await checkButton.click({ force: true });
    await expect
      .poll(async () => statusGets.some((url) => url.includes(attemptId!)), { timeout: 30_000 })
      .toBe(true);

    await expect(
      page.getByText("Retrieved persisted runner result for this attempt. No provider relaunch.", {
        exact: true
      })
    ).toBeVisible({ timeout: 30_000 });

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
});
