import { expect, test } from "@playwright/test";

import {
  createFeatureSprintFullLoopDogfoodState,
  FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT,
  FEATURE_SPRINT_DOGFOOD_MOCK_REVIEW_OUTPUT,
  FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID,
  FEATURE_SPRINT_FULL_LOOP_DOGFOOD_COMPLETED_SLICE_SUMMARY,
  FEATURE_SPRINT_FULL_LOOP_DOGFOOD_NEXT_SLICE_TITLE,
  FEATURE_SPRINT_FULL_LOOP_DOGFOOD_PLAN_BLOCK,
  FEATURE_SPRINT_FULL_LOOP_DOGFOOD_SPEC_UPDATE_OUTPUT
} from "../src/dogfood/featureSprintFullLoopSeed";
import { openFeatureSprintBackroom } from "./helpers/featureSprintBackroom";
import { seedWebDogfoodState } from "./helpers/webSeed";

test.describe("Feature Sprint full mock loop dogfood", () => {
  test("walks conductor UI with fixture imports through approve and advance", async ({ page }) => {
    await seedWebDogfoodState(page, createFeatureSprintFullLoopDogfoodState());
    await openFeatureSprintBackroom(page, FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID);

    await expect(page.getByText("Copy for ChatGPT/Codex scoping", { exact: true })).toBeVisible();

    const planInput = page.getByTestId("feature-sprint-plan-import-input");
    await planInput.scrollIntoViewIfNeeded();
    await planInput.fill(FEATURE_SPRINT_FULL_LOOP_DOGFOOD_PLAN_BLOCK);
    await page.getByTestId("feature-sprint-import-plan").click();
    await expect(page.getByText("Feature sprint plan imported.")).toBeVisible();
    await expect(page.getByText("▸ Core module · ready")).toBeVisible();

    await expect(page.getByText("Copy for Cursor localization", { exact: true })).toBeVisible();
    await expect(page.getByText("Copy for GPT/Codex prompt audit", { exact: true })).toBeVisible();
    await expect(page.getByText("Copy for Codex implementation", { exact: true })).toBeVisible();
    await expect(page.getByText("Copy for ChatGPT/Codex review", { exact: true })).toBeVisible();

    const agentOutputInput = page.getByTestId("feature-sprint-agent-output-input");
    await agentOutputInput.scrollIntoViewIfNeeded();
    await agentOutputInput.click();
    await agentOutputInput.fill(FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT);
    await expect(agentOutputInput).toHaveValue(FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT);
    await agentOutputInput.press("Tab");
    await page.getByTestId("feature-sprint-save-agent-output").click();
    await expect(page.getByText("Feature sprint step updated.")).toBeVisible();
    await expect(page.getByText("▸ Core module · sent")).toBeVisible();

    const reviewInput = page.getByTestId("feature-sprint-review-import-input");
    await reviewInput.scrollIntoViewIfNeeded();
    await reviewInput.click();
    await reviewInput.fill(FEATURE_SPRINT_DOGFOOD_MOCK_REVIEW_OUTPUT);
    await expect(reviewInput).toHaveValue(FEATURE_SPRINT_DOGFOOD_MOCK_REVIEW_OUTPUT);
    await reviewInput.press("Tab");
    await page.getByTestId("feature-sprint-import-review-verdict").click();
    await expect(page.getByText("Review verdict imported.")).toBeVisible();
    await expect(page.getByText("Core module · reviewing · review accepted")).toBeVisible();

    const specUpdateInput = page.getByTestId("feature-sprint-spec-update-input");
    await specUpdateInput.scrollIntoViewIfNeeded();
    await specUpdateInput.click();
    await specUpdateInput.fill(FEATURE_SPRINT_FULL_LOOP_DOGFOOD_SPEC_UPDATE_OUTPUT);
    await expect(specUpdateInput).toHaveValue(FEATURE_SPRINT_FULL_LOOP_DOGFOOD_SPEC_UPDATE_OUTPUT);
    await specUpdateInput.press("Tab");
    const specUpdateImport = page.getByTestId("feature-sprint-spec-update-import");
    await specUpdateImport.scrollIntoViewIfNeeded();
    await specUpdateImport.click();
    await expect(page.getByText("Spec update imported.")).toBeVisible();
    await expect(page.getByTestId("feature-sprint-spec-update-gate-warning")).toBeVisible();

    await page.getByTestId("feature-sprint-spec-update-summary").click();
    await expect(page.getByTestId("feature-sprint-spec-update-completed-summary")).toHaveText(
      FEATURE_SPRINT_FULL_LOOP_DOGFOOD_COMPLETED_SLICE_SUMMARY
    );
    await expect(
      page.getByText(FEATURE_SPRINT_FULL_LOOP_DOGFOOD_NEXT_SLICE_TITLE, { exact: true })
    ).toBeVisible();

    await expect(page.getByTestId("feature-sprint-spec-update-gate-warning")).toBeVisible();
    await expect(
      page.getByText("Revised spec imported. Approve it before advancing or running implementation.")
    ).toBeVisible();

    await page.getByTestId("feature-sprint-advance-step").click();
    await expect(
      page.getByText(
        "Import a spec update for this reviewed step and approve the revised feature spec before advancing."
      )
    ).toBeVisible();

    await page.getByTestId("feature-sprint-approve-feature-spec").click();
    await expect(page.getByText("Feature spec approved.")).toBeVisible();
    await expect(page.getByTestId("feature-sprint-spec-update-gate-warning")).toHaveCount(0);
    await expect(
      page.getByText("Spec approved and ready for implementation gating.")
    ).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("feature-sprint-advance-step").click();
    await expect(page.getByText("Feature sprint step advanced.")).toBeVisible();
    await expect(page.getByText("▸ Core module · done · review accepted")).toBeVisible();
    await expect(page.getByText("▸ UI · ready")).toBeVisible();
  });
});
