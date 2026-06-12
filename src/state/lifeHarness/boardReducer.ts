import { applyMvd, applyPounce, applySalvage } from "../../core/actions";
import { startSession } from "../../core/briefing";
import { nowIso } from "../../core/ids";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import type { BoardLifeHarnessAction } from "./actions";

const BOARD_ACTION_TYPES = new Set<BoardLifeHarnessAction["type"]>([
  "app_session_started",
  "pounce",
  "mvd_completed",
  "salvage_completed",
  "quick_capture_applied",
  "card_state_applied"
]);

export function isBoardAction(action: { type: string }): action is BoardLifeHarnessAction {
  return BOARD_ACTION_TYPES.has(action.type as BoardLifeHarnessAction["type"]);
}

export function boardReducer(
  state: LifeHarnessData,
  action: BoardLifeHarnessAction
): LifeHarnessData {
  switch (action.type) {
    case "app_session_started":
      return {
        ...state,
        dailyState: startSession(state.dailyState, nowIso())
      };
    case "pounce": {
      const result = applyPounce(state);
      return result.ok ? result.state : state;
    }
    case "mvd_completed": {
      const result = applyMvd(state);
      return result.ok ? result.state : state;
    }
    case "salvage_completed": {
      const result = applySalvage(state, action.optionLabel);
      return result.ok ? result.state : state;
    }
    case "quick_capture_applied":
      return action.state;
    case "card_state_applied":
      return action.state;
    default:
      return state;
  }
}
