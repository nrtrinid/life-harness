import type { FeatureSprintRunnerAgent } from "./featureSprintRunner";

/**
 * Session provider selection for Feature Sprint Backroom.
 * Sticky per mounted card: runner-history refreshes, Sprint Map phase changes,
 * and Save agent output must not rebind. Rebind only when the card id changes.
 */
export type FeatureSprintRunnerAgentSessionBinding = {
  boundCardId: string | null;
  runnerAgent: FeatureSprintRunnerAgent;
};

export function bindFeatureSprintRunnerAgentForCard(input: {
  cardId: string;
  binding: FeatureSprintRunnerAgentSessionBinding;
  projectDefaultRunnerAgent: FeatureSprintRunnerAgent;
}): FeatureSprintRunnerAgentSessionBinding {
  if (input.binding.boundCardId === input.cardId) {
    return input.binding;
  }

  return {
    boundCardId: input.cardId,
    runnerAgent: input.projectDefaultRunnerAgent
  };
}

/** Explicit Save project metadata applies the saved project default. */
export function applyFeatureSprintProjectDefaultRunnerAgent(
  projectDefaultRunnerAgent: FeatureSprintRunnerAgent
): FeatureSprintRunnerAgent {
  return projectDefaultRunnerAgent;
}

/** Explicit Clear project metadata resets to Codex. */
export function clearFeatureSprintProjectRunnerAgentDefault(): FeatureSprintRunnerAgent {
  return "codex";
}
