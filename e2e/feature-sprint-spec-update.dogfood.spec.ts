import { expect, test } from "@playwright/test";

import {
  createFeatureSprintSpecUpdateDogfoodState,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_COMPLETED_SLICE_SUMMARY,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_GPT_OUTPUT,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_NEXT_SLICE_TITLE
} from "../src/dogfood/featureSprintSpecUpdateSeed";
import { fillAndBlurByTestId } from "./helpers/fillAndBlur";
import { openFeatureSprintBackroom } from "./helpers/featureSprintBackroom";
import { seedWebDogfoodState } from "./helpers/webSeed";

test.describe("Feature Sprint spec-update dogfood", () => {
  test("imports GPT spec update, shows summary, and preserves advance/implementation gates", async ({
    page
  }) => {
    await seedWebDogfoodState(page, createFeatureSprintSpecUpdateDogfoodState());
    await openFeatureSprintBackroom(page, FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID);

    await fillAndBlurByTestId(
      page,
      "feature-sprint-spec-update-input",
      FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_GPT_OUTPUT
    );

    await page.getByTestId("feature-sprint-spec-update-import").click();
    await expect(page.getByText("Spec update imported.")).toBeVisible();
    await expect(page.getByTestId("feature-sprint-spec-update-gate-warning")).toBeVisible();

    await page.getByTestId("feature-sprint-spec-update-summary").click();
    await expect(page.getByTestId("feature-sprint-spec-update-completed-summary")).toHaveText(
      FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_COMPLETED_SLICE_SUMMARY
    );
    await expect(page.getByText("Next slice proposal")).toBeVisible();
    await expect(
      page.getByText(FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_NEXT_SLICE_TITLE, { exact: true })
    ).toBeVisible();

    await expect(page.getByTestId("feature-sprint-spec-update-gate-warning")).toBeVisible();
    await expect(page.getByText("Approve the persisted feature spec before running implementation")).toBeVisible();

    await page.getByTestId("feature-sprint-advance-step").click();
    await expect(
      page.getByText(
        "Import a spec update for this reviewed step and approve the revised feature spec before advancing."
      )
    ).toBeVisible();
    await expect(page.getByText("Core module · reviewing · review accepted")).toBeVisible();
    await expect(page.getByText("▸ UI · planned")).toBeVisible();
    await expect(page.getByTestId("feature-sprint-spec-update-gate-warning")).toBeVisible();

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
