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

export type AgentPolicyDecisionReason =
  | "workflow_unknown"
  | "allowed_by_policy"
  | "provider_surface_denied"
  | "context_source_denied"
  | "mutation_denied"
  | "containment_denied";

export type AgentPolicyDecision = {
  allowed: boolean;
  reason: AgentPolicyDecisionReason;
  workflowId: string;
  performanceMode: AgentPerformanceMode;
  detail: string;
};

export type AgentPolicyMutationRequest =
  | "none"
  | "proposal"
  | "user_approved_action"
  | "direct_mutation"
  | "external_agent_scope";

export type AgentPolicyContainmentRequest =
  | AgentContainmentType
  | "board_context"
  | "board_mutation"
  | "board_persistence"
  | "raw_lab_runtime_authority"
  | "companion_runtime_authority";

export type AgentPolicyOperationRequest = {
  workflowId: AgentWorkflowId;
  performanceMode?: AgentPerformanceMode;
  providerSurface?: AgentProviderSurface;
  contextSource?: AgentContextSourceId;
  mutation?: AgentPolicyMutationRequest;
  containment?: AgentPolicyContainmentRequest;
};

export type AgentPolicyAuditSeverity = "info" | "warning" | "error";

export type AgentPolicyAuditFindingCode =
  | "workflow_model_free"
  | "workflow_provider_enabled"
  | "workflow_proposal_only"
  | "workflow_user_approved"
  | "workflow_direct_mutation"
  | "workflow_external_agent_scope"
  | "workflow_isolated"
  | "workflow_containment_risk"
  | "permission_mode_drift"
  | "registry_permission_mismatch";

export type AgentPolicyAuditFinding = {
  severity: AgentPolicyAuditSeverity;
  code: AgentPolicyAuditFindingCode;
  workflowId: string;
  message: string;
};

export type AgentPolicyAuditRow = {
  workflowId: AgentWorkflowId;
  label: string;
  providerSurface: AgentProviderSurface;
  contextSources: AgentContextSourceId[];
  mutationPolicy: AgentMutationPolicy;
  containment: AgentContainmentType;
  modelFree: boolean;
  providerEnabled: boolean;
  boardContextAllowed: boolean;
  rawLabRuntimeAuthorityAllowed: boolean;
  directMutationAllowed: boolean;
  proposalOnly: boolean;
  userApprovalRequired: boolean;
  externalAgentScoped: boolean;
  isolated: boolean;
  findings: AgentPolicyAuditFinding[];
};

export type AgentPolicyAuditReport = {
  performanceMode: AgentPerformanceMode;
  workflowCount: number;
  rows: AgentPolicyAuditRow[];
  findings: AgentPolicyAuditFinding[];
  hasErrors: boolean;
  hasWarnings: boolean;
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

export function checkAgentPolicyProviderSurface(request: {
  workflowId: AgentWorkflowId;
  performanceMode?: AgentPerformanceMode;
  providerSurface: AgentProviderSurface;
}): AgentPolicyDecision {
  const policy = resolveWorkflowAgentPolicy(request.workflowId, request.performanceMode);
  if (!policy) {
    return denyUnknownWorkflow(request.workflowId, request.performanceMode);
  }

  if (policy.providerSurface !== request.providerSurface) {
    return denyPolicy(
      policy,
      "provider_surface_denied",
      `Requested provider surface ${request.providerSurface} does not match policy surface ${policy.providerSurface}.`
    );
  }

  return allowPolicy(policy, `Provider surface ${request.providerSurface} is allowed by policy.`);
}

export function checkAgentPolicyContextSource(request: {
  workflowId: AgentWorkflowId;
  performanceMode?: AgentPerformanceMode;
  contextSource: AgentContextSourceId;
}): AgentPolicyDecision {
  const policy = resolveWorkflowAgentPolicy(request.workflowId, request.performanceMode);
  if (!policy) {
    return denyUnknownWorkflow(request.workflowId, request.performanceMode);
  }

  if (!policy.contextSources.includes(request.contextSource)) {
    return denyPolicy(
      policy,
      "context_source_denied",
      `Context source ${request.contextSource} is not listed in policy context sources.`
    );
  }

  return allowPolicy(policy, `Context source ${request.contextSource} is allowed by policy.`);
}

export function checkAgentPolicyMutation(request: {
  workflowId: AgentWorkflowId;
  performanceMode?: AgentPerformanceMode;
  mutation: AgentPolicyMutationRequest;
}): AgentPolicyDecision {
  const policy = resolveWorkflowAgentPolicy(request.workflowId, request.performanceMode);
  if (!policy) {
    return denyUnknownWorkflow(request.workflowId, request.performanceMode);
  }

  if (!mutationAllowedByPolicy(policy.mutationPolicy, request.mutation)) {
    return denyPolicy(
      policy,
      "mutation_denied",
      `Mutation ${request.mutation} is denied by policy mutation ${policy.mutationPolicy}.`
    );
  }

  return allowPolicy(
    policy,
    `Mutation ${request.mutation} is allowed by policy mutation ${policy.mutationPolicy}.`
  );
}

export function checkAgentPolicyContainment(request: {
  workflowId: AgentWorkflowId;
  performanceMode?: AgentPerformanceMode;
  containment: AgentPolicyContainmentRequest;
}): AgentPolicyDecision {
  const policy = resolveWorkflowAgentPolicy(request.workflowId, request.performanceMode);
  if (!policy) {
    return denyUnknownWorkflow(request.workflowId, request.performanceMode);
  }

  if (!containmentAllowedByPolicy(policy.containment, request.containment)) {
    return denyPolicy(
      policy,
      "containment_denied",
      `Containment request ${request.containment} is denied by policy containment ${policy.containment}.`
    );
  }

  return allowPolicy(
    policy,
    `Containment request ${request.containment} is allowed by policy containment ${policy.containment}.`
  );
}

export function checkAgentPolicyOperation(
  request: AgentPolicyOperationRequest
): AgentPolicyDecision {
  const policy = resolveWorkflowAgentPolicy(request.workflowId, request.performanceMode);
  if (!policy) {
    return denyUnknownWorkflow(request.workflowId, request.performanceMode);
  }

  if (request.providerSurface !== undefined) {
    const decision = checkAgentPolicyProviderSurface({
      workflowId: request.workflowId,
      performanceMode: request.performanceMode,
      providerSurface: request.providerSurface
    });
    if (!decision.allowed) {
      return decision;
    }
  }

  if (request.contextSource !== undefined) {
    const decision = checkAgentPolicyContextSource({
      workflowId: request.workflowId,
      performanceMode: request.performanceMode,
      contextSource: request.contextSource
    });
    if (!decision.allowed) {
      return decision;
    }
  }

  if (request.mutation !== undefined) {
    const decision = checkAgentPolicyMutation({
      workflowId: request.workflowId,
      performanceMode: request.performanceMode,
      mutation: request.mutation
    });
    if (!decision.allowed) {
      return decision;
    }
  }

  if (request.containment !== undefined) {
    const decision = checkAgentPolicyContainment({
      workflowId: request.workflowId,
      performanceMode: request.performanceMode,
      containment: request.containment
    });
    if (!decision.allowed) {
      return decision;
    }
  }

  return allowPolicy(policy, "Operation request is allowed by policy.");
}

export function buildAgentPolicyAuditRow(
  workflowId: AgentWorkflowId,
  performanceMode: AgentPerformanceMode = "balanced"
): AgentPolicyAuditRow | undefined {
  const workflow = getAgentWorkflowDefinition(workflowId);
  const policy = resolveWorkflowAgentPolicy(workflowId, performanceMode);
  if (!workflow || !policy) {
    return undefined;
  }

  const directMutationAllowed = checkAgentPolicyMutation({
    workflowId,
    performanceMode,
    mutation: "direct_mutation"
  }).allowed;
  const rawLabRuntimeAuthorityAllowed = checkAgentPolicyContainment({
    workflowId,
    performanceMode,
    containment: "raw_lab_runtime_authority"
  }).allowed;
  const boardContextAllowed = policy.contextSources.includes("board_snapshot");
  const proposalOnly = policy.mutationPolicy === "user_approved_proposals_only";
  const userApprovalRequired =
    policy.mutationPolicy === "user_approved_actions_only" || proposalOnly;
  const externalAgentScoped = policy.mutationPolicy === "external_agent_scoped";
  const isolated = policy.containment === "raw_lab_isolated";

  const row: AgentPolicyAuditRow = {
    workflowId,
    label: workflow.label,
    providerSurface: policy.providerSurface,
    contextSources: [...policy.contextSources],
    mutationPolicy: policy.mutationPolicy,
    containment: policy.containment,
    modelFree: policy.modelTier === "none",
    providerEnabled: policy.providerSurface !== "none",
    boardContextAllowed,
    rawLabRuntimeAuthorityAllowed,
    directMutationAllowed,
    proposalOnly,
    userApprovalRequired,
    externalAgentScoped,
    isolated,
    findings: []
  };

  row.findings = buildAgentPolicyAuditRowFindings(row);
  return row;
}

export function listAgentPolicyAuditRows(
  performanceMode: AgentPerformanceMode = "balanced"
): AgentPolicyAuditRow[] {
  return listAgentWorkflowDefinitions().map((workflow) => {
    const row = buildAgentPolicyAuditRow(workflow.id, performanceMode);
    if (!row) {
      throw new Error(`Missing agent policy audit row for registered workflow: ${workflow.id}`);
    }
    return row;
  });
}

export function buildAgentPolicyAuditReport(
  performanceMode: AgentPerformanceMode = "balanced"
): AgentPolicyAuditReport {
  const rows = listAgentPolicyAuditRows(performanceMode);
  const findings = buildGlobalAgentPolicyAuditFindings(performanceMode);

  return {
    performanceMode,
    workflowCount: rows.length,
    rows,
    findings,
    hasErrors: findings.some((finding) => finding.severity === "error"),
    hasWarnings:
      findings.some((finding) => finding.severity === "warning") ||
      rows.some((row) => row.findings.some((finding) => finding.severity === "warning"))
  };
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

function mutationAllowedByPolicy(
  policy: AgentMutationPolicy,
  mutation: AgentPolicyMutationRequest
): boolean {
  if (mutation === "none") {
    return true;
  }

  switch (policy) {
    case "none":
      return false;
    case "user_approved_proposals_only":
      return mutation === "proposal";
    case "user_approved_actions_only":
      return mutation === "proposal" || mutation === "user_approved_action";
    case "external_agent_scoped":
      return mutation === "external_agent_scope";
  }
}

function containmentAllowedByPolicy(
  policy: AgentContainmentType,
  containment: AgentPolicyContainmentRequest
): boolean {
  if (containment === policy) {
    return true;
  }

  switch (policy) {
    case "grounded":
      return containment === "board_context" || containment === "companion_runtime_authority";
    case "raw_lab_isolated":
      return false;
    case "dev_agent":
      return containment === "board_context";
    case "deterministic_local":
      return containment === "board_context";
  }
}

function buildAgentPolicyAuditRowFindings(
  row: AgentPolicyAuditRow
): AgentPolicyAuditFinding[] {
  const findings: AgentPolicyAuditFinding[] = [];

  if (row.modelFree) {
    findings.push(
      auditFinding("info", "workflow_model_free", row.workflowId, "Workflow uses no model tier.")
    );
  }

  if (row.providerEnabled) {
    findings.push(
      auditFinding(
        "info",
        "workflow_provider_enabled",
        row.workflowId,
        `Workflow uses provider surface ${row.providerSurface}.`
      )
    );
  }

  if (row.proposalOnly) {
    findings.push(
      auditFinding(
        "info",
        "workflow_proposal_only",
        row.workflowId,
        "Workflow can produce proposals only."
      )
    );
  }

  if (row.userApprovalRequired) {
    findings.push(
      auditFinding(
        "info",
        "workflow_user_approved",
        row.workflowId,
        "Workflow requires user approval for policy-permitted mutations."
      )
    );
  }

  if (row.directMutationAllowed) {
    findings.push(
      auditFinding(
        "warning",
        "workflow_direct_mutation",
        row.workflowId,
        "Workflow policy permits direct mutation."
      )
    );
  }

  if (row.externalAgentScoped) {
    findings.push(
      auditFinding(
        "info",
        "workflow_external_agent_scope",
        row.workflowId,
        "Workflow is scoped to an external/dev-agent runner."
      )
    );
  }

  if (row.isolated) {
    findings.push(
      auditFinding(
        "info",
        "workflow_isolated",
        row.workflowId,
        "Workflow is isolated from grounded board authority."
      )
    );
  }

  if (row.isolated && (row.boardContextAllowed || row.rawLabRuntimeAuthorityAllowed)) {
    findings.push(
      auditFinding(
        "warning",
        "workflow_containment_risk",
        row.workflowId,
        "Isolated workflow has board context or raw runtime authority beyond its containment."
      )
    );
  }

  return findings;
}

function buildGlobalAgentPolicyAuditFindings(
  performanceMode: AgentPerformanceMode
): AgentPolicyAuditFinding[] {
  const findings: AgentPolicyAuditFinding[] = [];

  for (const workflow of listAgentWorkflowDefinitions()) {
    const policy = resolveWorkflowAgentPolicy(workflow.id, performanceMode);
    if (!policy || !agentPolicyPermissionsMatchRegistry(policy)) {
      findings.push(
        auditFinding(
          "error",
          "registry_permission_mismatch",
          workflow.id,
          "Resolved policy permissions do not match the workflow registry."
        )
      );
    }

    const baseline = resolveWorkflowAgentPolicy(workflow.id, "balanced");
    if (!baseline) {
      continue;
    }

    for (const mode of AGENT_PERFORMANCE_MODES) {
      const candidate = resolveWorkflowAgentPolicy(workflow.id, mode);
      if (
        !candidate ||
        candidate.providerSurface !== baseline.providerSurface ||
        !sameContextSources(candidate.contextSources, baseline.contextSources) ||
        candidate.mutationPolicy !== baseline.mutationPolicy ||
        candidate.containment !== baseline.containment
      ) {
        findings.push(
          auditFinding(
            "error",
            "permission_mode_drift",
            workflow.id,
            `Performance mode ${mode} changes registry-derived permissions.`
          )
        );
      }
    }
  }

  return findings;
}

function auditFinding(
  severity: AgentPolicyAuditSeverity,
  code: AgentPolicyAuditFindingCode,
  workflowId: string,
  message: string
): AgentPolicyAuditFinding {
  return {
    severity,
    code,
    workflowId,
    message
  };
}

function allowPolicy(policy: ResolvedAgentPolicy, detail: string): AgentPolicyDecision {
  return {
    allowed: true,
    reason: "allowed_by_policy",
    workflowId: policy.workflowId,
    performanceMode: policy.performanceMode,
    detail
  };
}

function denyPolicy(
  policy: ResolvedAgentPolicy,
  reason: Exclude<AgentPolicyDecisionReason, "allowed_by_policy" | "workflow_unknown">,
  detail: string
): AgentPolicyDecision {
  return {
    allowed: false,
    reason,
    workflowId: policy.workflowId,
    performanceMode: policy.performanceMode,
    detail
  };
}

function denyUnknownWorkflow(
  workflowId: AgentWorkflowId,
  performanceMode: AgentPerformanceMode = "balanced"
): AgentPolicyDecision {
  return {
    allowed: false,
    reason: "workflow_unknown",
    workflowId,
    performanceMode,
    detail: `Workflow ${workflowId} is not registered.`
  };
}
