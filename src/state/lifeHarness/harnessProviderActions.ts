import type { Dispatch, MutableRefObject } from "react";

import { applyConfirmedAssistantAction, type AssistantProposedAction } from "../../core/assistantActionRegistry";
import {
  applyCreateAgentSessionForCard,
  applyUpdateAgentSession,
  type HarnessAgentSessionCompleteInput,
  type HarnessAgentSessionCreateInput,
  type HarnessAgentSessionUpdateInput
} from "../../core/agentSessionLog";
import { applyCompleteAgentSessionWithEvidence } from "../../core/actions";
import {
  createFeatureSprintPlanForCard,
  deleteFeatureSprintPlan,
  importFeatureReviewVerdictFromText,
  importFeatureSprintPlanFromText,
  updateFeatureSprintPlan,
  type FeatureSprintPlanCreateInput,
  type FeatureSprintPlanUpdateInput,
  type FeatureSprintStepUpdateInput
} from "../../core/featureSprintOrchestrator";
import {
  completeFeatureSprintRunnerRun,
  createFeatureSprintRunnerRun,
  markFeatureSprintRunnerRunWorktreeCleanup,
  markMostRecentFeatureSprintRunnerRunImported,
  type FeatureSprintRunnerRunCreateInput,
  type FeatureSprintRunnerRunImportMarkFilter
} from "../../core/featureSprintRunnerHistory";
import type {
  FeatureSprintRunnerResponse,
  FeatureSprintWorktreeCleanupResponse
} from "../../core/featureSprintRunner";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import type { HarnessProjectUpsertInput } from "../../core/projectRegistry";
import type { HarnessChatSummary, HarnessMemoryItem } from "../../core/types";
import type { LifeHarnessAction } from "./actions";

export function createHarnessProviderActions(
  stateRef: MutableRefObject<LifeHarnessData>,
  dispatch: Dispatch<LifeHarnessAction>
) {
  return {
    saveChatSummary: (summary: HarnessChatSummary) => {
      dispatch({ type: "save_chat_summary", summary });
    },

    deleteChatSummary: (summaryId: string) => {
      dispatch({ type: "delete_chat_summary", summaryId });
    },

    saveMemoryItem: (item: HarnessMemoryItem) => {
      dispatch({ type: "save_memory_item", item });
    },

    deleteMemoryItem: (itemId: string) => {
      dispatch({ type: "delete_memory_item", itemId });
    },

    updateMemoryItem: (item: HarnessMemoryItem) => {
      dispatch({ type: "update_memory_item", item });
    },

    toggleMemoryItemActive: (itemId: string) => {
      dispatch({ type: "toggle_memory_item_active", itemId });
    },

    saveProjectForCard: (input: HarnessProjectUpsertInput) => {
      const card = stateRef.current.cards.find((item) => item.id === input.cardId);
      if (!card) {
        return { ok: false, message: `Card not found: ${input.cardId}` };
      }
      dispatch({ type: "save_project", input });
      return { ok: true, message: "Project metadata saved." };
    },

    clearProjectForCard: (cardId: string) => {
      dispatch({ type: "delete_project", cardId });
      return { ok: true, message: "Project metadata cleared." };
    },

    createAgentSessionForCard: (input: HarnessAgentSessionCreateInput) => {
      const card = stateRef.current.cards.find((item) => item.id === input.cardId);
      if (!card) {
        return { ok: false, message: `Card not found: ${input.cardId}` };
      }
      const result = applyCreateAgentSessionForCard(stateRef.current, input);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Agent session saved.", sessionId: result.sessionId };
    },

    updateAgentSession: (sessionId: string, patch: HarnessAgentSessionUpdateInput) => {
      const existing = stateRef.current.agentSessions.find((session) => session.id === sessionId);
      if (!existing) {
        return { ok: false, message: "Session not found." };
      }
      const result = applyUpdateAgentSession(stateRef.current, sessionId, patch);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Agent session updated." };
    },

    completeAgentSession: (sessionId: string, input: HarnessAgentSessionCompleteInput = {}) => {
      const existing = stateRef.current.agentSessions.find((session) => session.id === sessionId);
      if (!existing) {
        return { ok: false, message: "Session not found." };
      }
      const result = applyCompleteAgentSessionWithEvidence(stateRef.current, sessionId, input);
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: result.ok, message: result.message };
    },

    deleteAgentSession: (sessionId: string) => {
      const existing = stateRef.current.agentSessions.find((session) => session.id === sessionId);
      if (!existing) {
        return { ok: false, message: "Session not found." };
      }
      dispatch({ type: "delete_agent_session", sessionId });
      return { ok: true, message: "Agent session deleted." };
    },

    createFeatureSprintPlanForCard: (input: FeatureSprintPlanCreateInput) => {
      const result = createFeatureSprintPlanForCard(stateRef.current, input);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Feature sprint plan created.", planId: result.planId };
    },

    updateFeatureSprintPlan: (planId: string, patch: FeatureSprintPlanUpdateInput) => {
      const result = updateFeatureSprintPlan(stateRef.current, planId, patch);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Feature sprint plan updated." };
    },

    updateFeatureSprintStep: (planId: string, stepId: string, patch: FeatureSprintStepUpdateInput) => {
      const existing = stateRef.current.featureSprintPlans.find((plan) => plan.id === planId);
      if (!existing) {
        return { ok: false, message: "Plan not found." };
      }
      dispatch({ type: "update_feature_sprint_step", planId, stepId, patch });
      return { ok: true, message: "Feature sprint step updated." };
    },

    advanceFeatureSprintStep: (planId: string, stepId: string) => {
      const existing = stateRef.current.featureSprintPlans.find((plan) => plan.id === planId);
      if (!existing) {
        return { ok: false, message: "Plan not found." };
      }
      dispatch({ type: "advance_feature_sprint_step", planId, stepId });
      return { ok: true, message: "Feature sprint step advanced." };
    },

    completeFeatureSprintPlan: (planId: string, input?: { proofText?: string }) => {
      const existing = stateRef.current.featureSprintPlans.find((plan) => plan.id === planId);
      if (!existing) {
        return { ok: false, message: "Plan not found." };
      }
      const hadEvidence = !!(existing.evidenceLogId || existing.evidenceProofItemId);
      dispatch({ type: "complete_feature_sprint_plan", planId, input });
      return {
        ok: true,
        message: hadEvidence ? "Feature sprint marked complete." : "Feature sprint complete · Proof updated."
      };
    },

    deleteFeatureSprintPlan: (planId: string) => {
      const result = deleteFeatureSprintPlan(stateRef.current, planId);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Feature sprint plan deleted." };
    },

    importFeatureSprintPlanForCard: (cardId: string, text: string) => {
      const result = importFeatureSprintPlanFromText(stateRef.current, cardId, text);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Feature sprint plan imported.", planId: result.planId };
    },

    importFeatureReviewVerdictForPlan: (planId: string, text: string, stepId?: string) => {
      const result = importFeatureReviewVerdictFromText(stateRef.current, planId, text, stepId);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Review verdict imported." };
    },

    createFeatureSprintRunnerRun: (input: FeatureSprintRunnerRunCreateInput) => {
      const result = createFeatureSprintRunnerRun(stateRef.current, input);
      if (!result.ok) {
        return { ok: false, message: result.error, safetyBlocked: result.safetyBlocked };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Runner history started.", runId: result.runId };
    },

    completeFeatureSprintRunnerRun: (runId: string, response: FeatureSprintRunnerResponse) => {
      const result = completeFeatureSprintRunnerRun(stateRef.current, runId, response);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: "Runner history updated." };
    },

    markMostRecentFeatureSprintRunnerRunImported: (
      filter: FeatureSprintRunnerRunImportMarkFilter
    ) => {
      const result = markMostRecentFeatureSprintRunnerRunImported(stateRef.current, filter);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      if (result.runId) {
        dispatch({ type: "state_replaced", state: result.state });
      }
      return {
        ok: true,
        message: result.runId ? "Runner output marked imported." : "No matching runner run to mark.",
        runId: result.runId
      };
    },

    markFeatureSprintRunnerRunWorktreeCleanup: (
      runId: string,
      response: FeatureSprintWorktreeCleanupResponse
    ) => {
      const result = markFeatureSprintRunnerRunWorktreeCleanup(stateRef.current, runId, response);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.state });
      return { ok: true, message: response.message };
    },

    confirmAssistantAction: (action: AssistantProposedAction) => {
      const result = applyConfirmedAssistantAction(stateRef.current, action);
      if (!result.ok) {
        return { ok: false, message: result.error };
      }
      dispatch({ type: "state_replaced", state: result.data });
      return { ok: true, message: result.message };
    }
  };
}
