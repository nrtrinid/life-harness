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
import { fillAndBlurByTestId } from "./helpers/fillAndBlur";
import { openFeatureSprintBackroom } from "./helpers/featureSprintBackroom";
import { seedWebDogfoodState } from "./helpers/webSeed";

test.describe("Feature Sprint full mock loop dogfood", () => {
  test("walks conductor UI with fixture imports through approve and advance", async ({ page }) => {
    await seedWebDogfoodState(page, createFeatureSprintFullLoopDogfoodState());
    await openFeatureSprintBackroom(page, FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID);

    await expect(page.getByText("Copy for Codex scoping", { exact: true })).toBeVisible();

    await fillAndBlurByTestId(
      page,
      "feature-sprint-plan-import-input",
      FEATURE_SPRINT_FULL_LOOP_DOGFOOD_PLAN_BLOCK
    );
    await page.getByTestId("feature-sprint-import-plan").click();
    await expect(page.getByText("Feature sprint plan imported.")).toBeVisible();
    await expect(page.getByText("▸ Core module · ready")).toBeVisible();

    await expect(page.getByText("Copy for Cursor localization", { exact: true })).toBeVisible();
    await expect(page.getByText("Copy for GPT/Codex prompt audit", { exact: true })).toBeVisible();
    await expect(page.getByText("Copy for Codex implementation", { exact: true })).toBeVisible();
    await expect(page.getByText("Copy for ChatGPT/Codex review", { exact: true })).toBeVisible();

    await fillAndBlurByTestId(
      page,
      "feature-sprint-agent-output-input",
      FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT
    );
    await page.getByTestId("feature-sprint-save-agent-output").click();
    await expect(page.getByText("Feature sprint step updated.")).toBeVisible();
    await expect(page.getByText("▸ Core module · sent")).toBeVisible();

    await fillAndBlurByTestId(page, "feature-sprint-review-import-input", FEATURE_SPRINT_DOGFOOD_MOCK_REVIEW_OUTPUT);
    await page.getByTestId("feature-sprint-import-review-verdict").click();
    await expect(page.getByText("Review verdict imported.")).toBeVisible();
    await expect(page.getByText("Core module · reviewing · review accepted")).toBeVisible();

    await fillAndBlurByTestId(
      page,
      "feature-sprint-spec-update-input",
      FEATURE_SPRINT_FULL_LOOP_DOGFOOD_SPEC_UPDATE_OUTPUT
    );
    const specUpdateImport = page.getByTestId("feature-sprint-spec-update-import");
    await specUpdateImport.scrollIntoViewIfNeeded();
    await specUpdateImport.click();
    // Prefer durable gate/state signals; the toast can be ephemeral under slow suites.
    await expect(page.getByTestId("feature-sprint-spec-update-gate-warning")).toBeVisible({
      timeout: 30_000
    });
    await expect(page.getByText("Spec update imported.", { exact: true })).toBeVisible();

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
    // Advance remains blocked until revised spec is approved (toast is ephemeral).
    await expect(page.getByTestId("feature-sprint-spec-update-gate-warning")).toBeVisible();
    await expect(
      page.getByText(
        "Review accepted. Approve the revised feature spec, then use Advance step.",
        { exact: true }
      )
    ).toBeVisible();

    await page.getByTestId("feature-sprint-approve-feature-spec").scrollIntoViewIfNeeded();
    const approveSpecButton = page.getByTestId("feature-sprint-approve-feature-spec");
    await expect(approveSpecButton).toBeEnabled({ timeout: 30_000 });
    await approveSpecButton.click();
    await expect(page.getByTestId("feature-sprint-spec-update-gate-warning")).toHaveCount(0);
    await expect(
      page.getByText("Spec approved and ready for implementation gating.")
    ).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("feature-sprint-advance-step").click();
    await expect(page.getByText("▸ Core module · done · review accepted")).toBeVisible();
    await expect(page.getByText("▸ UI · ready")).toBeVisible();
  });
});
