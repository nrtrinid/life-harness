import { Platform } from "react-native";
import type { Dispatch } from "react";

import { applyAppSessionStart } from "../../core/briefing";
import { nowIso } from "../../core/ids";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import { createCleanBootstrapState, createSeedState } from "../../data/createSeedState";
import {
  clearLifeHarnessPersistence,
  parseLifeHarnessImport,
  serializeLifeHarnessSnapshot
} from "./persistence";
import type { LifeHarnessAction } from "./actions";

function downloadJsonOnWeb(json: string): boolean {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return false;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `life-harness-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

export function createSnapshotProviderActions(
  state: LifeHarnessData,
  dispatch: Dispatch<LifeHarnessAction>,
  persistenceAvailable: boolean
) {
  return {
    exportSnapshot: () => {
      const json = serializeLifeHarnessSnapshot(state);
      const downloaded = downloadJsonOnWeb(json);
      if (downloaded) {
        return { ok: true, message: "Snapshot downloaded." };
      }
      return {
        ok: true,
        message: persistenceAvailable
          ? "Snapshot ready (download not supported on this platform)."
          : "Snapshot JSON prepared (local persistence unavailable on this platform)."
      };
    },

    importSnapshot: (json: string) => {
      const result = parseLifeHarnessImport(json);
      if (!result.ok || !result.data) {
        return { ok: false, message: result.error ?? "Import failed." };
      }
      dispatch({ type: "state_replaced", state: result.data });
      return { ok: true, message: "Snapshot imported." };
    },

    resetToSeed: () => {
      clearLifeHarnessPersistence();
      dispatch({ type: "state_replaced", state: createSeedState(nowIso()) });
      return { ok: true, message: "Restored demo seed board." };
    },

    resetToClean: () => {
      clearLifeHarnessPersistence();
      dispatch({
        type: "state_replaced",
        state: applyAppSessionStart(createCleanBootstrapState(nowIso()), new Date())
      });
      return { ok: true, message: "Reset to clean board." };
    }
  };
}
