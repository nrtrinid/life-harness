import type { LifeHarnessData } from "../../core/lifeHarnessData";
import type { CareerLifeHarnessAction } from "./actions";

const CAREER_ACTION_TYPES = new Set<CareerLifeHarnessAction["type"]>([
  "career_intake_applied",
  "job_candidate_intake_applied",
  "job_candidate_updated",
  "job_source_updated"
]);

export function isCareerAction(action: { type: string }): action is CareerLifeHarnessAction {
  return CAREER_ACTION_TYPES.has(action.type as CareerLifeHarnessAction["type"]);
}

/**
 * Career / Job Scout reducer slice.
 * Most career mutations are computed in core `apply*` helpers; the provider dispatches
 * pre-built `LifeHarnessData` snapshots for this domain.
 */
export function careerReducer(
  state: LifeHarnessData,
  action: CareerLifeHarnessAction
): LifeHarnessData {
  switch (action.type) {
    case "career_intake_applied":
    case "job_candidate_intake_applied":
    case "job_candidate_updated":
    case "job_source_updated":
      return action.state;
    default:
      return state;
  }
}
