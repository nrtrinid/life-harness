import { applyCompleteAgentSessionWithEvidence } from "../../core/actions";
import {
  applyCreateAgentSessionForCard,
  applyDeleteAgentSession,
  applyUpdateAgentSession
} from "../../core/agentSessionLog";
import {
  applyAdvanceFeatureSprintStep,
  applyCompleteFeatureSprintPlan,
  applyCreateFeatureSprintPlanForCard,
  applyDeleteFeatureSprintPlan,
  applyUpdateFeatureSprintPlan,
  applyUpdateFeatureSprintStep
} from "../../core/featureSprintOrchestrator";
import { applyDeleteChatSummary, applySaveChatSummary } from "../../core/harnessMemory";
import {
  applyDeleteMemoryItem,
  applySaveMemoryItem,
  applyToggleMemoryItemActive,
  applyUpdateMemoryItem
} from "../../core/harnessMemoryBank";
import {
  applyDeleteProjectForCard,
  applyUpsertProjectForCard
} from "../../core/projectRegistry";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import type { HarnessLifeHarnessAction } from "./actions";

const HARNESS_ACTION_TYPES = new Set<HarnessLifeHarnessAction["type"]>([
  "save_chat_summary",
  "delete_chat_summary",
  "save_memory_item",
  "delete_memory_item",
  "update_memory_item",
  "toggle_memory_item_active",
  "save_project",
  "delete_project",
  "create_agent_session",
  "update_agent_session",
  "complete_agent_session",
  "delete_agent_session",
  "create_feature_sprint_plan",
  "update_feature_sprint_plan",
  "update_feature_sprint_step",
  "advance_feature_sprint_step",
  "complete_feature_sprint_plan",
  "delete_feature_sprint_plan"
]);

export function isHarnessAction(action: { type: string }): action is HarnessLifeHarnessAction {
  return HARNESS_ACTION_TYPES.has(action.type as HarnessLifeHarnessAction["type"]);
}

export function harnessReducer(
  state: LifeHarnessData,
  action: HarnessLifeHarnessAction
): LifeHarnessData {
  switch (action.type) {
    case "save_chat_summary":
      return applySaveChatSummary(state, action.summary);
    case "delete_chat_summary":
      return applyDeleteChatSummary(state, action.summaryId);
    case "save_memory_item":
      return applySaveMemoryItem(state, action.item);
    case "delete_memory_item":
      return applyDeleteMemoryItem(state, action.itemId);
    case "update_memory_item":
      return applyUpdateMemoryItem(state, action.item);
    case "toggle_memory_item_active":
      return applyToggleMemoryItemActive(state, action.itemId);
    case "save_project": {
      const result = applyUpsertProjectForCard(state, action.input);
      return result.ok ? result.state : state;
    }
    case "delete_project":
      return applyDeleteProjectForCard(state, action.cardId);
    case "create_agent_session": {
      const result = applyCreateAgentSessionForCard(state, action.input);
      return result.ok ? result.state : state;
    }
    case "update_agent_session": {
      const result = applyUpdateAgentSession(state, action.sessionId, action.patch);
      return result.ok ? result.state : state;
    }
    case "complete_agent_session":
      return applyCompleteAgentSessionWithEvidence(state, action.sessionId, action.input).state;
    case "delete_agent_session":
      return applyDeleteAgentSession(state, action.sessionId);
    case "create_feature_sprint_plan":
      return applyCreateFeatureSprintPlanForCard(state, action.input);
    case "update_feature_sprint_plan":
      return applyUpdateFeatureSprintPlan(state, action.planId, action.patch);
    case "update_feature_sprint_step":
      return applyUpdateFeatureSprintStep(state, action.planId, action.stepId, action.patch);
    case "advance_feature_sprint_step":
      return applyAdvanceFeatureSprintStep(state, action.planId, action.stepId);
    case "complete_feature_sprint_plan":
      return applyCompleteFeatureSprintPlan(state, action.planId, action.input);
    case "delete_feature_sprint_plan":
      return applyDeleteFeatureSprintPlan(state, action.planId);
    default:
      return state;
  }
}
