import type { Page } from "@playwright/test";

import type { LifeHarnessData } from "../../src/core/lifeHarnessData";
import { createEnvelope } from "../../src/storage/persistence";
import { STORAGE_KEY } from "../../src/storage/localStorageAdapter";

export function serializeDogfoodWebSnapshot(data: LifeHarnessData): string {
  return JSON.stringify(createEnvelope(data));
}

/**
 * Force-overwrite storage on every document start (legacy fixture scenarios).
 */
export async function seedWebDogfoodState(page: Page, data: LifeHarnessData): Promise<void> {
  const snapshotJson = serializeDogfoodWebSnapshot(data);
  await page.addInitScript(
    ({ storageKey, raw }) => {
      localStorage.setItem(storageKey, raw);
    },
    { storageKey: STORAGE_KEY, raw: snapshotJson }
  );
}

/**
 * Seed once, then let the app own persistence across reloads.
 * Use for durable launch recovery dogfood.
 */
export async function seedWebDogfoodStatePreserveAcrossReload(
  page: Page,
  data: LifeHarnessData
): Promise<void> {
  const snapshotJson = serializeDogfoodWebSnapshot(data);
  await page.addInitScript(
    ({ storageKey, raw }) => {
      const markerKey = `${storageKey}::__dogfood_seeded`;
      if (sessionStorage.getItem(markerKey) === "1") {
        return;
      }
      localStorage.setItem(storageKey, raw);
      sessionStorage.setItem(markerKey, "1");
    },
    { storageKey: STORAGE_KEY, raw: snapshotJson }
  );
}
