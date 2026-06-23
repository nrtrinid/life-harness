import type { Locator, Page } from "@playwright/test";

export async function fillAndBlur(locator: Locator, value: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await locator.fill(value);
  await locator.press("Tab");
}

export async function fillAndBlurByTestId(page: Page, testId: string, value: string): Promise<void> {
  await fillAndBlur(page.getByTestId(testId), value);
}

