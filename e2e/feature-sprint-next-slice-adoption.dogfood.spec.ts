import { expect, test } from "@playwright/test";

import {
  createFeatureSprintNextSliceAdoptionDogfoodState,
  FEATURE_SPRINT_NEXT_SLICE_ADOPTION_DOGFOOD_CARD_ID,
  FEATURE_SPRINT_NEXT_SLICE_ADOPTION_MOCK_IMPLEMENTATION_OUTPUT,
  FEATURE_SPRINT_NEXT_SLICE_ADOPTION_MOCK_REVIEW_OUTPUT,
  FEATURE_SPRINT_NEXT_SLICE_ADOPTION_NEXT_SLICE_TITLE,
  FEATURE_SPRINT_NEXT_SLICE_ADOPTION_SINGLE_STEP_PLAN_BLOCK,
  FEATURE_SPRINT_NEXT_SLICE_ADOPTION_SPEC_UPDATE_OUTPUT
} from "../src/dogfood/featureSprintNextSliceAdoptionSeed";
import { openFeatureSprintBackroom } from "./helpers/featureSprintBackroom";
import { seedWebDogfoodState } from "./helpers/webSeed";

test.describe("Feature Sprint next slice adoption dogfood", () => {
  test("adopts an unmatched next slice proposal into a new ready step", async ({ page }) => {
    await seedWebDogfoodState(page, createFeatureSprintNextSliceAdoptionDogfoodState());
    await openFeatureSprintBackroom(page, FEATURE_SPRINT_NEXT_SLICE_ADOPTION_DOGFOOD_CARD_ID);

    const planInput = page.getByTestId("feature-sprint-plan-import-input");
    await planInput.scrollIntoViewIfNeeded();
    await planInput.fill(FEATURE_SPRINT_NEXT_SLICE_ADOPTION_SINGLE_STEP_PLAN_BLOCK);
    await page.getByTestId("feature-sprint-import-plan").click();
    await expect(page.getByText("Feature sprint plan imported.")).toBeVisible();
    await expect(page.getByText("▸ Core module · ready")).toBeVisible();

    const agentOutputInput = page.getByTestId("feature-sprint-agent-output-input");
    await agentOutputInput.scrollIntoViewIfNeeded();
    await agentOutputInput.click();
    await agentOutputInput.fill(FEATURE_SPRINT_NEXT_SLICE_ADOPTION_MOCK_IMPLEMENTATION_OUTPUT);
    await expect(agentOutputInput).toHaveValue(FEATURE_SPRINT_NEXT_SLICE_ADOPTION_MOCK_IMPLEMENTATION_OUTPUT);
    await agentOutputInput.press("Tab");
    await page.getByTestId("feature-sprint-save-agent-output").click();
    await expect(page.getByText("Feature sprint step updated.")).toBeVisible();

    const reviewInput = page.getByTestId("feature-sprint-review-import-input");
    await reviewInput.scrollIntoViewIfNeeded();
    await reviewInput.click();
    await reviewInput.fill(FEATURE_SPRINT_NEXT_SLICE_ADOPTION_MOCK_REVIEW_OUTPUT);
    await expect(reviewInput).toHaveValue(FEATURE_SPRINT_NEXT_SLICE_ADOPTION_MOCK_REVIEW_OUTPUT);
    await reviewInput.press("Tab");
    await page.getByTestId("feature-sprint-import-review-verdict").click();
    await expect(page.getByText("Review verdict imported.")).toBeVisible();

    const specUpdateInput = page.getByTestId("feature-sprint-spec-update-input");
    await specUpdateInput.scrollIntoViewIfNeeded();
    await specUpdateInput.click();
    await specUpdateInput.fill(FEATURE_SPRINT_NEXT_SLICE_ADOPTION_SPEC_UPDATE_OUTPUT);
    await expect(specUpdateInput).toHaveValue(FEATURE_SPRINT_NEXT_SLICE_ADOPTION_SPEC_UPDATE_OUTPUT);
    await specUpdateInput.press("Tab");
    await page.getByTestId("feature-sprint-spec-update-import").click();
    await expect(page.getByText("Spec update imported.")).toBeVisible();

    await page.getByTestId("feature-sprint-approve-feature-spec").scrollIntoViewIfNeeded();
    const approveSpecButton = page.getByTestId("feature-sprint-approve-feature-spec");
    await expect(approveSpecButton).toBeEnabled({ timeout: 30_000 });
    await approveSpecButton.click();
    await expect(page.getByText("Feature spec approved.")).toBeVisible();

    await page.getByTestId("feature-sprint-advance-step").click();
    await expect(page.getByText("Feature sprint step advanced.")).toBeVisible();

    const adoptButton = page.getByTestId("feature-sprint-adopt-next-slice");
    await adoptButton.scrollIntoViewIfNeeded();
    await expect(adoptButton).toBeVisible();
    await adoptButton.click();
    await expect(page.getByText("Next slice adopted as the current slice.")).toBeVisible();
    await expect(page.getByText(`▸ ${FEATURE_SPRINT_NEXT_SLICE_ADOPTION_NEXT_SLICE_TITLE} · ready`)).toBeVisible();
  });
});

