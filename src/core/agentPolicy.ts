import {
  getAgentWorkflowDefinition,
  listAgentWorkflowDefinitions,
  type AgentContainmentType,
  type AgentContextSourceId,
  type AgentModelTier,
  type AgentMutationPolicy,
  type AgentProviderSurface,
  type AgentWorkflowDefinition,
  type AgentWorkflowId
} from "./agentWorkflowRegistry";

export type AgentPerformanceMode = "quiet" | "balanced" | "fast" | "ultra";

export type AgentVerificationDepth = "none" | "focused" | "related" | "full";

export type ResolvedAgentPolicy = {
  workflowId: AgentWorkflowId;
  performanceMode: AgentPerformanceMode;
  providerSurface: AgentProviderSurface;
  modelTier: AgentModelTier;
  contextSources: AgentContextSourceId[];
  mutationPolicy: AgentMutationPolicy;
  containment: AgentContainmentType;
  maxInputChars: number;
  allowCritic: boolean;
  allowRepair: boolean;
  maxRepairAttempts: number;
  verificationDepth: AgentVerificationDepth;
  allowParallelism: boolean;
  keepWarm: boolean;
  rationale: string[];
};

export type ResolveAgentPolicyInput = {
  workflowId: AgentWorkflowId;
  performanceMode?: AgentPerformanceMode;
};

export type AgentPolicySummary = {
  workflowId: AgentWorkflowId;
  label: string;
  performanceMode: AgentPerformanceMode;
  providerSurface: AgentProviderSurface;
  modelTier: AgentModelTier;
  contextSources: AgentContextSourceId[];
  mutationPolicy: AgentMutationPolicy;
  containment: AgentContainmentType;
  inputBudget: number;
  verificationDepth: AgentVerificationDepth;
  repairAttempts: number;
  usesCritic: boolean;
  usesRepair: boolean;
  allowsMutation: boolean;
  allowsParallelism: boolean;
  keepWarm: boolean;
};

const MODE_BUDGETS: Record<
  AgentPerformanceMode,
  {
    maxInputChars: number;
    maxRepairAttempts: number;
    verificationDepth: AgentVerificationDepth;
  }
> = {
  quiet: {
    maxInputChars: 6_000,
    maxRepairAttempts: 0,
    verificationDepth: "none"
  },
  balanced: {
    maxInputChars: 12_000,
    maxRepairAttempts: 1,
    verificationDepth: "focused"
  },
  fast: {
    maxInputChars: 24_000,
    maxRepairAttempts: 2,
    verificationDepth: "related"
  },
  ultra: {
    maxInputChars: 48_000,
    maxRepairAttempts: 3,
    verificationDepth: "full"
  }
};

const DETERMINISTIC_BUDGETS: Record<
  AgentPerformanceMode,
  {
    maxInputChars: number;
    verificationDepth: AgentVerificationDepth;
  }
> = {
  quiet: {
    maxInputChars: 2_000,
    verificationDepth: "none"
  },
  balanced: {
    maxInputChars: 4_000,
    verificationDepth: "focused"
  },
  fast: {
    maxInputChars: 8_000,
    verificationDepth: "focused"
  },
  ultra: {
    maxInputChars: 16_000,
    verificationDepth: "focused"
  }
};

export const AGENT_PERFORMANCE_MODES: readonly AgentPerformanceMode[] = [
  "quiet",
  "balanced",
  "fast",
  "ultra"
] as const;

export const AGENT_VERIFICATION_DEPTHS: readonly AgentVerificationDepth[] = [
  "none",
  "focused",
  "related",
  "full"
] as const;

export function resolveAgentPolicy(
  input: ResolveAgentPolicyInput
): ResolvedAgentPolicy | undefined {
  const workflow = getAgentWorkflowDefinition(input.workflowId);
  if (!workflow) {
    return undefined;
  }

  const performanceMode = input.performanceMode ?? "balanced";
  const basePolicy = fromRegistry(workflow, performanceMode);

  if (workflow.kind === "deterministic_rules") {
    return resolveDeterministicPolicy(basePolicy);
  }

  if (workflow.containment === "raw_lab_isolated") {
    return resolveRawLabPolicy(basePolicy);
  }

  if (workflow.kind === "external_agent_runner") {
    return resolveExternalRunnerPolicy(basePolicy);
  }

  if (workflow.kind === "gateway_synthesis") {
    return resolveDeepSynthesisPolicy(basePolicy);
  }

  if (workflow.kind === "gateway_utility" || workflow.kind === "gateway_job") {
    return resolveUtilityPolicy(basePolicy);
  }

  return resolveGroundedChatPolicy(basePolicy);
}

export function resolveWorkflowAgentPolicy(
  workflowId: AgentWorkflowId,
  performanceMode: AgentPerformanceMode = "balanced"
): ResolvedAgentPolicy | undefined {
  return resolveAgentPolicy({ workflowId, performanceMode });
}

export function summarizeAgentPolicy(policy: ResolvedAgentPolicy): AgentPolicySummary {
  const workflow = getAgentWorkflowDefinition(policy.workflowId);

  return {
    workflowId: policy.workflowId,
    label: workflow?.label ?? policy.workflowId,
    performanceMode: policy.performanceMode,
    providerSurface: policy.providerSurface,
    modelTier: policy.modelTier,
    contextSources: [...policy.contextSources],
    mutationPolicy: policy.mutationPolicy,
    containment: policy.containment,
    inputBudget: policy.maxInputChars,
    verificationDepth: policy.verificationDepth,
    repairAttempts: policy.maxRepairAttempts,
    usesCritic: policy.allowCritic,
    usesRepair: policy.allowRepair,
    allowsMutation: policy.mutationPolicy !== "none",
    allowsParallelism: policy.allowParallelism,
    keepWarm: policy.keepWarm
  };
}

export function resolveAgentPolicySummary(
  workflowId: AgentWorkflowId,
  performanceMode: AgentPerformanceMode = "balanced"
): AgentPolicySummary | undefined {
  const policy = resolveWorkflowAgentPolicy(workflowId, performanceMode);
  return policy ? summarizeAgentPolicy(policy) : undefined;
}

export function listResolvedAgentPolicies(
  performanceMode: AgentPerformanceMode = "balanced"
): ResolvedAgentPolicy[] {
  return listAgentWorkflowDefinitions().map((workflow) => {
    const policy = resolveWorkflowAgentPolicy(workflow.id, performanceMode);
    if (!policy) {
      throw new Error(`Missing agent policy for registered workflow: ${workflow.id}`);
    }
    return policy;
  });
}

export function listAgentPolicySummaries(
  performanceMode: AgentPerformanceMode = "balanced"
): AgentPolicySummary[] {
  return listResolvedAgentPolicies(performanceMode).map(summarizeAgentPolicy);
}

export function agentPolicyPermissionsMatchRegistry(policy: ResolvedAgentPolicy): boolean {
  const workflow = getAgentWorkflowDefinition(policy.workflowId);
  if (!workflow) {
    return false;
  }

  return (
    policy.providerSurface === workflow.providerSurface &&
    sameContextSources(policy.contextSources, workflow.contextSources) &&
    policy.mutationPolicy === workflow.mutationPolicy &&
    policy.containment === workflow.containment
  );
}

function fromRegistry(
  workflow: AgentWorkflowDefinition,
  performanceMode: AgentPerformanceMode
): ResolvedAgentPolicy {
  const budget = MODE_BUDGETS[performanceMode];

  return {
    workflowId: workflow.id,
    performanceMode,
    providerSurface: workflow.providerSurface,
    modelTier: workflow.defaultModelTier,
    contextSources: [...workflow.contextSources],
    mutationPolicy: workflow.mutationPolicy,
    containment: workflow.containment,
    maxInputChars: budget.maxInputChars,
    allowCritic: false,
    allowRepair: budget.maxRepairAttempts > 0,
    maxRepairAttempts: budget.maxRepairAttempts,
    verificationDepth: budget.verificationDepth,
    allowParallelism: performanceMode === "fast" || performanceMode === "ultra",
    keepWarm: performanceMode === "fast" || performanceMode === "ultra",
    rationale: [
      "Policy copies registry permissions before applying performance budgets.",
      "Performance mode can increase compute, but never permissions."
    ]
  };
}

function resolveDeterministicPolicy(policy: ResolvedAgentPolicy): ResolvedAgentPolicy {
  const budget = DETERMINISTIC_BUDGETS[policy.performanceMode];

  return {
    ...policy,
    modelTier: "none",
    maxInputChars: budget.maxInputChars,
    allowCritic: false,
    allowRepair: false,
    maxRepairAttempts: 0,
    verificationDepth: budget.verificationDepth,
    allowParallelism: false,
    keepWarm: false,
    rationale: [...policy.rationale, "Deterministic workflows stay rules-only."]
  };
}

function resolveRawLabPolicy(policy: ResolvedAgentPolicy): ResolvedAgentPolicy {
  return {
    ...policy,
    allowCritic: policy.performanceMode === "ultra",
    allowRepair: policy.performanceMode === "fast" || policy.performanceMode === "ultra",
    allowParallelism: false,
    keepWarm: false,
    rationale: [...policy.rationale, "Raw Lab remains isolated from board context and mutation."]
  };
}

function resolveExternalRunnerPolicy(policy: ResolvedAgentPolicy): ResolvedAgentPolicy {
  return {
    ...policy,
    allowCritic: false,
    allowRepair: false,
    maxRepairAttempts: 0,
    allowParallelism: policy.performanceMode === "fast" || policy.performanceMode === "ultra",
    keepWarm: false,
    rationale: [...policy.rationale, "External runners remain scoped outside ai-gateway model control."]
  };
}

function resolveDeepSynthesisPolicy(policy: ResolvedAgentPolicy): ResolvedAgentPolicy {
  return {
    ...policy,
    mutationPolicy: "user_approved_proposals_only",
    modelTier: policy.performanceMode === "ultra" ? "critic_small" : policy.modelTier,
    allowCritic: policy.performanceMode === "fast" || policy.performanceMode === "ultra",
    allowRepair: policy.performanceMode !== "quiet",
    keepWarm: policy.performanceMode === "ultra",
    rationale: [...policy.rationale, "Deep Synthesis remains proposals-only."]
  };
}

function resolveUtilityPolicy(policy: ResolvedAgentPolicy): ResolvedAgentPolicy {
  return {
    ...policy,
    allowCritic: false,
    allowRepair: false,
    maxRepairAttempts: 0,
    verificationDepth: policy.performanceMode === "quiet" ? "none" : "focused",
    allowParallelism: false,
    keepWarm: false,
    rationale: [...policy.rationale, "Utility workflows do not expand model behavior."]
  };
}

function resolveGroundedChatPolicy(policy: ResolvedAgentPolicy): ResolvedAgentPolicy {
  const quiet = policy.performanceMode === "quiet";
  const ultra = policy.performanceMode === "ultra";

  return {
    ...policy,
    allowCritic: ultra,
    allowRepair: !quiet,
    maxRepairAttempts: quiet ? 0 : policy.maxRepairAttempts,
    keepWarm: policy.performanceMode === "fast" || ultra,
    rationale: [...policy.rationale, "Grounded chat keeps registry mutation permissions."]
  };
}

function sameContextSources(
  left: readonly AgentContextSourceId[],
  right: readonly AgentContextSourceId[]
): boolean {
  return left.length === right.length && left.every((source, index) => source === right[index]);
}
