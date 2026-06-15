import type { Page } from "@playwright/test";

import type { LifeHarnessData } from "../../src/core/lifeHarnessData";
import { createEnvelope } from "../../src/storage/persistence";
import { STORAGE_KEY } from "../../src/storage/localStorageAdapter";

export function serializeDogfoodWebSnapshot(data: LifeHarnessData): string {
  return JSON.stringify(createEnvelope(data));
}

export async function seedWebDogfoodState(page: Page, data: LifeHarnessData): Promise<void> {
  const snapshotJson = serializeDogfoodWebSnapshot(data);
  await page.addInitScript(
    ({ storageKey, raw }) => {
      localStorage.setItem(storageKey, raw);
    },
    { storageKey: STORAGE_KEY, raw: snapshotJson }
  );
}
