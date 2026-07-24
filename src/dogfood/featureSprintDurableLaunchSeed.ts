import {
  applyFeatureSprintLegalAction
} from "../core/featureSprintApplyLegalAction";
import { createMockKernelSprintSeed } from "../core/featureSprintKernelDogfood";
import { buildApplyInputFromPresentation } from "../core/featureSprintManualKernelBridge";
import { getNextFeatureSprintLegalAction } from "../core/featureSprintNextLegalAction";
import type { LifeHarnessData } from "../core/lifeHarnessData";
import type { HarnessFeatureSprintLegalAction } from "../core/types";

export const FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_CARD_ID = "card-kernel-mock";
export const FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_PLAN_ID = "plan-kernel-mock";
export const FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID = "task-kernel-1";

export type DurableLaunchReadyDogfoodSeed = {
  state: LifeHarnessData;
  cardId: string;
  planId: string;
  taskId: string;
  nextAction: HarnessFeatureSprintLegalAction;
};

/** Parser-safe, fast command the mock runner can actually execute and pass. */
export const FEATURE_SPRINT_DURABLE_LAUNCH_VERIFY_COMMAND = "node --version";

/**
 * Mock implementation writes `.life-harness/mock-implementation-result.md`; keep that
 * path in allowed scope so Normalize/proof can succeed after a real runner launch.
 */
export const FEATURE_SPRINT_DURABLE_LAUNCH_ALLOWED_PATHS = [
  "src/core/**",
  ".life-harness/**"
] as const;

/**
 * Seed a kernel-managed sprint one UI click away from launch_implementation.
 * Advances approve_spec → freeze_spec → adopt_sprint_map → select_task in core only.
 */
export function createDurableLaunchReadyDogfoodState(input?: {
  repoPath?: string;
  verificationCommand?: string;
  allowedPaths?: string[];
  now?: string;
}): DurableLaunchReadyDogfoodSeed {
  const verificationCommand =
    input?.verificationCommand ?? FEATURE_SPRINT_DURABLE_LAUNCH_VERIFY_COMMAND;
  const allowedPaths = input?.allowedPaths ?? [...FEATURE_SPRINT_DURABLE_LAUNCH_ALLOWED_PATHS];
  const seed = createMockKernelSprintSeed({
    now: input?.now,
    verificationCommand,
    allowedPaths
  });

  let state: LifeHarnessData = {
    ...seed.state,
    projects: seed.state.projects.map((project) =>
      project.cardId === seed.cardId
        ? {
            ...project,
            repoPath: input?.repoPath ?? project.repoPath,
            verificationCommands: [verificationCommand]
          }
        : project
    )
  };

  for (let i = 0; i < 8; i += 1) {
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    if (!("action" in next)) {
      throw new Error(`Expected legal action while preparing durable launch seed, got hold/error.`);
    }
    if (next.action === "launch_implementation") {
      return {
        state,
        cardId: seed.cardId,
        planId: seed.planId,
        taskId: seed.taskId,
        nextAction: next.action
      };
    }
    if (next.action === "human_hold" || next.action === "request_clarification") {
      throw new Error(`Durable launch seed stopped on ${next.action}.`);
    }
    const applied = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(next));
    if (!applied.ok) {
      throw new Error(applied.error);
    }
    state = applied.state;
  }

  throw new Error("Durable launch seed did not reach launch_implementation.");
}
