import type { Dispatch } from "react";

import { applyCardStateChange, applyQuickCapture, withProofSuffix } from "../../core/actions";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import type { CardState } from "../../core/types";
import type { LifeHarnessAction } from "./actions";

export function createBoardProviderActions(
  state: LifeHarnessData,
  dispatch: Dispatch<LifeHarnessAction>
) {
  return {
    pounce: () => {
      if (state.dailyState.pounceStarted) {
        return { ok: false, message: "Pounce already logged this session." };
      }
      dispatch({ type: "pounce" });
      return { ok: true, message: withProofSuffix("+10 XP · Career pounce logged", true) };
    },

    completeMinimumViableDay: () => {
      if (state.dailyState.minimumViableDayCompleted) {
        return { ok: false, message: "Minimum viable day already logged this session." };
      }
      dispatch({ type: "mvd_completed" });
      return { ok: true, message: withProofSuffix("+30 XP · Day preserved", true) };
    },

    completeSalvage: (optionLabel: string) => {
      if (state.dailyState.salvageCompleted) {
        return { ok: false, message: "Salvage already logged this session." };
      }
      dispatch({ type: "salvage_completed", optionLabel });
      return { ok: true, message: withProofSuffix("+30 XP · Salvage logged", true) };
    },

    submitQuickCapture: (rawText: string) => {
      const result = applyQuickCapture(state, rawText);
      if (result.ok) {
        dispatch({ type: "quick_capture_applied", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    setCardState: (cardId: string, newState: CardState) => {
      const result = applyCardStateChange(state, cardId, newState);
      if (result.ok) {
        dispatch({ type: "card_state_applied", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    }
  };
}
