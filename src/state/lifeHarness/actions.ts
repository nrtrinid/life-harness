import type { CareerIntakeInput } from "../../core/career";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import type { JobCandidateIntakeInput } from "../../core/jobScout";
import type {
  HarnessAgentSessionCompleteInput,
  HarnessAgentSessionCreateInput,
  HarnessAgentSessionUpdateInput
} from "../../core/agentSessionLog";
import type {
  FeatureSprintPlanCreateInput,
  FeatureSprintPlanUpdateInput,
  FeatureSprintStepUpdateInput
} from "../../core/featureSprintOrchestrator";
import type { HarnessProjectUpsertInput } from "../../core/projectRegistry";
import type { HarnessChatSummary, HarnessMemoryItem } from "../../core/types";

export type LifeHarnessAction =
  | { type: "app_session_started" }
  | { type: "pounce" }
  | { type: "mvd_completed" }
  | { type: "salvage_completed"; optionLabel: string }
  | { type: "quick_capture_applied"; state: LifeHarnessData }
  | { type: "card_state_applied"; state: LifeHarnessData }
  | { type: "main_quest_applied"; state: LifeHarnessData }
  | { type: "create_card_applied"; state: LifeHarnessData }
  | { type: "demo_triage_dismissed"; state: LifeHarnessData }
  | { type: "career_intake_applied"; state: LifeHarnessData }
  | { type: "job_candidate_intake_applied"; state: LifeHarnessData }
  | { type: "job_candidate_updated"; state: LifeHarnessData }
  | { type: "job_source_updated"; state: LifeHarnessData }
  | { type: "save_chat_summary"; summary: HarnessChatSummary }
  | { type: "delete_chat_summary"; summaryId: string }
  | { type: "save_memory_item"; item: HarnessMemoryItem }
  | { type: "delete_memory_item"; itemId: string }
  | { type: "update_memory_item"; item: HarnessMemoryItem }
  | { type: "toggle_memory_item_active"; itemId: string }
  | { type: "save_project"; input: HarnessProjectUpsertInput }
  | { type: "delete_project"; cardId: string }
  | { type: "create_agent_session"; input: HarnessAgentSessionCreateInput }
  | { type: "update_agent_session"; sessionId: string; patch: HarnessAgentSessionUpdateInput }
  | {
      type: "complete_agent_session";
      sessionId: string;
      input: HarnessAgentSessionCompleteInput;
    }
  | { type: "delete_agent_session"; sessionId: string }
  | { type: "create_feature_sprint_plan"; input: FeatureSprintPlanCreateInput }
  | { type: "update_feature_sprint_plan"; planId: string; patch: FeatureSprintPlanUpdateInput }
  | {
      type: "update_feature_sprint_step";
      planId: string;
      stepId: string;
      patch: FeatureSprintStepUpdateInput;
    }
  | { type: "advance_feature_sprint_step"; planId: string; stepId: string }
  | {
      type: "complete_feature_sprint_plan";
      planId: string;
      input?: { proofText?: string };
    }
  | { type: "delete_feature_sprint_plan"; planId: string }
  | { type: "state_replaced"; state: LifeHarnessData };

export type BoardLifeHarnessAction = Extract<
  LifeHarnessAction,
  | { type: "app_session_started" }
  | { type: "pounce" }
  | { type: "mvd_completed" }
  | { type: "salvage_completed" }
  | { type: "quick_capture_applied" }
  | { type: "card_state_applied" }
  | { type: "main_quest_applied" }
  | { type: "create_card_applied" }
  | { type: "demo_triage_dismissed" }
>;

export type CareerLifeHarnessAction = Extract<
  LifeHarnessAction,
  | { type: "career_intake_applied" }
  | { type: "job_candidate_intake_applied" }
  | { type: "job_candidate_updated" }
  | { type: "job_source_updated" }
>;

export type HarnessLifeHarnessAction = Extract<
  LifeHarnessAction,
  | { type: "save_chat_summary" }
  | { type: "delete_chat_summary" }
  | { type: "save_memory_item" }
  | { type: "delete_memory_item" }
  | { type: "update_memory_item" }
  | { type: "toggle_memory_item_active" }
  | { type: "save_project" }
  | { type: "delete_project" }
  | { type: "create_agent_session" }
  | { type: "update_agent_session" }
  | { type: "complete_agent_session" }
  | { type: "delete_agent_session" }
  | { type: "create_feature_sprint_plan" }
  | { type: "update_feature_sprint_plan" }
  | { type: "update_feature_sprint_step" }
  | { type: "advance_feature_sprint_step" }
  | { type: "complete_feature_sprint_plan" }
  | { type: "delete_feature_sprint_plan" }
>;

/** Re-export for action builders that validate intake payloads at the provider edge. */
export type { CareerIntakeInput, JobCandidateIntakeInput };
