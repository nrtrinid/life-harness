import { describe, expect, it } from "vitest";

import {
  AGENT_WORKFLOWS,
  getAgentWorkflowDefinition,
  listAgentWorkflowDefinitions,
  type AgentMutationPolicy,
  type AgentWorkflowId
} from "./agentWorkflowRegistry";
import {
  AGENT_PERFORMANCE_MODES,
  AGENT_VERIFICATION_DEPTHS,
  agentPolicyPermissionsMatchRegistry,
  listAgentPolicySummaries,
  listResolvedAgentPolicies,
  resolveAgentPolicySummary,
  resolveAgentPolicy,
  resolveWorkflowAgentPolicy,
  type AgentPerformanceMode,
  type AgentVerificationDepth,
  type ResolvedAgentPolicy
} from "./agentPolicy";

const VERIFICATION_RANK: Record<AgentVerificationDepth, number> = {
  none: 0,
  focused: 1,
  related: 2,
  full: 3
};

function requirePolicy(
  workflowId: AgentWorkflowId,
  performanceMode?: AgentPerformanceMode
): ResolvedAgentPolicy {
  const policy = resolveAgentPolicy({ workflowId, performanceMode });
  expect(policy).toBeDefined();
  return policy!;
}

function mutationRank(policy: AgentMutationPolicy): number {
  switch (policy) {
    case "none":
      return 0;
    case "user_approved_proposals_only":
      return 1;
    case "user_approved_actions_only":
      return 2;
    case "external_agent_scoped":
      return 3;
  }
}

describe("agentPolicy", () => {
  it("defaults to balanced mode", () => {
    expect(requirePolicy("chat_harness").performanceMode).toBe("balanced");
    expect(resolveWorkflowAgentPolicy("chat_harness")?.performanceMode).toBe("balanced");
    expect(resolveAgentPolicySummary("chat_harness")?.performanceMode).toBe("balanced");
  });

  it("resolves explicit modes through the consumer helper", () => {
    for (const performanceMode of AGENT_PERFORMANCE_MODES) {
      const policy = resolveWorkflowAgentPolicy("chat_harness", performanceMode);

      expect(policy?.workflowId).toBe("chat_harness");
      expect(policy?.performanceMode).toBe(performanceMode);
    }
  });

  it("returns undefined for unknown workflow IDs like the registry helper", () => {
    const unknown = "missing_workflow" as AgentWorkflowId;

    expect(getAgentWorkflowDefinition(unknown)).toBeUndefined();
    expect(resolveAgentPolicy({ workflowId: unknown })).toBeUndefined();
    expect(resolveWorkflowAgentPolicy(unknown)).toBeUndefined();
    expect(resolveAgentPolicySummary(unknown)).toBeUndefined();
  });

  it("keeps deterministic workflows model-free without critic, repair, keep-warm, or parallelism", () => {
    for (const workflow of AGENT_WORKFLOWS.filter((candidate) => candidate.kind === "deterministic_rules")) {
      for (const performanceMode of AGENT_PERFORMANCE_MODES) {
        const policy = requirePolicy(workflow.id, performanceMode);

        expect(policy.modelTier).toBe("none");
        expect(policy.allowCritic).toBe(false);
        expect(policy.allowRepair).toBe(false);
        expect(policy.maxRepairAttempts).toBe(0);
        expect(policy.keepWarm).toBe(false);
        expect(policy.allowParallelism).toBe(false);
        expect(["none", "focused"]).toContain(policy.verificationDepth);
      }
    }
  });

  it("keeps Raw Lab workflows isolated in every mode", () => {
    for (const workflow of AGENT_WORKFLOWS.filter((candidate) => candidate.id.startsWith("raw_lab"))) {
      for (const performanceMode of AGENT_PERFORMANCE_MODES) {
        const policy = requirePolicy(workflow.id, performanceMode);

        expect(policy.containment).toBe("raw_lab_isolated");
        expect(policy.contextSources).not.toContain("board_snapshot");
        expect(policy.contextSources).not.toContain("context_packet");
        expect(policy.providerSurface).toBe(workflow.providerSurface);
        expect(policy.mutationPolicy).toBe(workflow.mutationPolicy);
      }
    }
  });

  it("does not loosen mutation policy in ultra mode", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      const balanced = requirePolicy(workflow.id, "balanced");
      const ultra = requirePolicy(workflow.id, "ultra");

      expect(mutationRank(ultra.mutationPolicy)).toBeLessThanOrEqual(
        mutationRank(balanced.mutationPolicy)
      );
      expect(ultra.mutationPolicy).toBe(workflow.mutationPolicy);
    }
  });

  it("keeps Chat Harness user-approved actions in every mode", () => {
    for (const performanceMode of AGENT_PERFORMANCE_MODES) {
      expect(requirePolicy("chat_harness", performanceMode).mutationPolicy).toBe(
        "user_approved_actions_only"
      );
    }
  });

  it("keeps Deep Synthesis proposals-only in every mode", () => {
    for (const workflowId of ["deep_synthesis", "deep_synthesis_job"] as const) {
      for (const performanceMode of AGENT_PERFORMANCE_MODES) {
        expect(requirePolicy(workflowId, performanceMode).mutationPolicy).toBe(
          "user_approved_proposals_only"
        );
      }
    }
  });

  it("keeps Feature Sprint runner external and dev-agent scoped", () => {
    for (const performanceMode of AGENT_PERFORMANCE_MODES) {
      const policy = requirePolicy("feature_sprint_runner", performanceMode);

      expect(policy.providerSurface).toBe("feature_sprint_runner");
      expect(policy.containment).toBe("dev_agent");
      expect(policy.mutationPolicy).toBe("external_agent_scoped");
      expect(policy.modelTier).toBe("external_frontier");
    }
  });

  it("makes fast and ultra monotonically larger than quiet and balanced in safe compute fields", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      const quiet = requirePolicy(workflow.id, "quiet");
      const balanced = requirePolicy(workflow.id, "balanced");
      const fast = requirePolicy(workflow.id, "fast");
      const ultra = requirePolicy(workflow.id, "ultra");

      expect(balanced.maxInputChars).toBeGreaterThanOrEqual(quiet.maxInputChars);
      expect(fast.maxInputChars).toBeGreaterThanOrEqual(balanced.maxInputChars);
      expect(ultra.maxInputChars).toBeGreaterThanOrEqual(fast.maxInputChars);
      expect(balanced.maxRepairAttempts).toBeGreaterThanOrEqual(quiet.maxRepairAttempts);
      expect(fast.maxRepairAttempts).toBeGreaterThanOrEqual(balanced.maxRepairAttempts);
      expect(ultra.maxRepairAttempts).toBeGreaterThanOrEqual(fast.maxRepairAttempts);
      expect(VERIFICATION_RANK[balanced.verificationDepth]).toBeGreaterThanOrEqual(
        VERIFICATION_RANK[quiet.verificationDepth]
      );
      expect(VERIFICATION_RANK[fast.verificationDepth]).toBeGreaterThanOrEqual(
        VERIFICATION_RANK[balanced.verificationDepth]
      );
      expect(VERIFICATION_RANK[ultra.verificationDepth]).toBeGreaterThanOrEqual(
        VERIFICATION_RANK[fast.verificationDepth]
      );
    }
  });

  it("never grants mutation beyond the registry mutation policy", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      for (const performanceMode of AGENT_PERFORMANCE_MODES) {
        expect(requirePolicy(workflow.id, performanceMode).mutationPolicy).toBe(
          workflow.mutationPolicy
        );
      }
    }
  });

  it("keeps registry permission fields invariant across performance modes", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      for (const performanceMode of AGENT_PERFORMANCE_MODES) {
        const policy = requirePolicy(workflow.id, performanceMode);

        expect(policy.providerSurface).toBe(workflow.providerSurface);
        expect(policy.contextSources).toEqual(workflow.contextSources);
        expect(policy.mutationPolicy).toBe(workflow.mutationPolicy);
        expect(policy.containment).toBe(workflow.containment);
        expect(agentPolicyPermissionsMatchRegistry(policy)).toBe(true);
      }
    }
  });

  it("resolves every workflow in every performance mode", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      for (const performanceMode of AGENT_PERFORMANCE_MODES) {
        const policy = requirePolicy(workflow.id, performanceMode);

        expect(policy.workflowId).toBe(workflow.id);
        expect(policy.performanceMode).toBe(performanceMode);
        expect(AGENT_VERIFICATION_DEPTHS).toContain(policy.verificationDepth);
      }
    }
  });

  it("creates compact deterministic policy summaries", () => {
    const first = resolveAgentPolicySummary("chat_harness", "fast");
    const second = resolveAgentPolicySummary("chat_harness", "fast");

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      workflowId: "chat_harness",
      label: "Companion (Chat Harness)",
      performanceMode: "fast",
      providerSurface: "ai_gateway",
      mutationPolicy: "user_approved_actions_only",
      containment: "grounded",
      verificationDepth: "related",
      usesCritic: false,
      allowsMutation: true
    });
    expect(first?.contextSources).toContain("board_snapshot");
    expect(first?.inputBudget).toBeGreaterThan(0);
    expect(first?.repairAttempts).toBeGreaterThan(0);
    expect(Object.keys(first ?? {})).not.toContain("rationale");
    expect(Object.keys(first ?? {})).not.toContain("coreFiles");
    expect(Object.keys(first ?? {})).not.toContain("testFiles");
    expect(Object.keys(first ?? {})).not.toContain("endpoint");
  });

  it("lists resolved policies and summaries for every registered workflow in stable order", () => {
    const expectedIds = listAgentWorkflowDefinitions().map((workflow) => workflow.id);

    for (const performanceMode of AGENT_PERFORMANCE_MODES) {
      const policies = listResolvedAgentPolicies(performanceMode);
      const summaries = listAgentPolicySummaries(performanceMode);

      expect(policies.map((policy) => policy.workflowId)).toEqual(expectedIds);
      expect(summaries.map((summary) => summary.workflowId)).toEqual(expectedIds);
      expect(policies).toHaveLength(AGENT_WORKFLOWS.length);
      expect(summaries).toHaveLength(AGENT_WORKFLOWS.length);
      expect(summaries.every((summary) => summary.performanceMode === performanceMode)).toBe(true);
    }
  });
});
