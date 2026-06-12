import type { LifeHarnessData } from "../../core/lifeHarnessData";
import type { LifeHarnessAction } from "./actions";
import { boardReducer, isBoardAction } from "./boardReducer";
import { careerReducer, isCareerAction } from "./careerReducer";
import { harnessReducer, isHarnessAction } from "./harnessReducer";
import { proofReducer } from "./proofReducer";

export function lifeHarnessReducer(state: LifeHarnessData, action: LifeHarnessAction): LifeHarnessData {
  if (action.type === "state_replaced") {
    return action.state;
  }

  if (isBoardAction(action)) {
    return boardReducer(state, action);
  }

  if (isCareerAction(action)) {
    return careerReducer(state, action);
  }

  if (isHarnessAction(action)) {
    return harnessReducer(state, action);
  }

  if (proofReducer(state, action) !== null) {
    return state;
  }

  return state;
}
