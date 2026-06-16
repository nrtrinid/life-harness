import type { Page } from "@playwright/test";

export async function openFeatureSprintBackroom(page: Page, cardId: string): Promise<void> {
  await page.goto(`/card/${cardId}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("card-detail-mode-backroom").waitFor();
  await page.getByTestId("card-detail-mode-backroom").click();
  await page.getByTestId("card-backroom-sprint-metadata").click();
}
