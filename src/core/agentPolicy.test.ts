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
  buildAgentPolicyAuditReport,
  buildAgentPolicyAuditRow,
  checkAgentPolicyContainment,
  checkAgentPolicyContextSource,
  checkAgentPolicyMutation,
  checkAgentPolicyOperation,
  checkAgentPolicyProviderSurface,
  listAgentPolicyAuditRows,
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

  it("builds compact audit rows with permission fields and derived flags", () => {
    const row = buildAgentPolicyAuditRow("chat_harness");

    expect(row).toMatchObject({
      workflowId: "chat_harness",
      label: "Companion (Chat Harness)",
      providerSurface: "ai_gateway",
      mutationPolicy: "user_approved_actions_only",
      containment: "grounded",
      modelFree: false,
      providerEnabled: true,
      boardContextAllowed: true,
      rawLabRuntimeAuthorityAllowed: false,
      directMutationAllowed: false,
      proposalOnly: false,
      userApprovalRequired: true,
      externalAgentScoped: false,
      isolated: false
    });
    expect(row?.contextSources).toContain("board_snapshot");
    expect(row?.findings.map((finding) => finding.code)).toEqual([
      "workflow_provider_enabled",
      "workflow_user_approved"
    ]);
    expect(Object.keys(row ?? {})).not.toContain("rationale");
    expect(Object.keys(row ?? {})).not.toContain("coreFiles");
    expect(Object.keys(row ?? {})).not.toContain("testFiles");
    expect(Object.keys(row ?? {})).not.toContain("endpoint");
  });

  it("represents important workflow postures in audit rows", () => {
    expect(buildAgentPolicyAuditRow("raw_lab")).toMatchObject({
      isolated: true,
      boardContextAllowed: false,
      rawLabRuntimeAuthorityAllowed: false,
      directMutationAllowed: false
    });
    expect(buildAgentPolicyAuditRow("raw_lab")?.findings.map((finding) => finding.code)).toEqual([
      "workflow_provider_enabled",
      "workflow_isolated"
    ]);

    expect(buildAgentPolicyAuditRow("deep_synthesis")).toMatchObject({
      proposalOnly: true,
      userApprovalRequired: true,
      directMutationAllowed: false
    });
    expect(buildAgentPolicyAuditRow("chat_harness")).toMatchObject({
      proposalOnly: false,
      userApprovalRequired: true,
      directMutationAllowed: false
    });
    expect(buildAgentPolicyAuditRow("context_packet_build")).toMatchObject({
      modelFree: true,
      providerEnabled: false,
      directMutationAllowed: false
    });
    expect(buildAgentPolicyAuditRow("feature_sprint_runner")).toMatchObject({
      providerSurface: "feature_sprint_runner",
      containment: "dev_agent",
      externalAgentScoped: true,
      directMutationAllowed: false
    });
  });

  it("lists audit rows for every workflow in stable order for every performance mode", () => {
    const expectedIds = listAgentWorkflowDefinitions().map((workflow) => workflow.id);

    for (const performanceMode of AGENT_PERFORMANCE_MODES) {
      const rows = listAgentPolicyAuditRows(performanceMode);

      expect(rows.map((row) => row.workflowId)).toEqual(expectedIds);
      expect(rows).toHaveLength(AGENT_WORKFLOWS.length);
      expect(rows.every((row) => row.findings.every((finding) => finding.workflowId === row.workflowId))).toBe(
        true
      );
    }
  });

  it("builds deterministic audit reports without current invariant errors", () => {
    const first = buildAgentPolicyAuditReport();
    const second = buildAgentPolicyAuditReport();

    expect(first).toEqual(second);
    expect(first.performanceMode).toBe("balanced");
    expect(first.workflowCount).toBe(AGENT_WORKFLOWS.length);
    expect(first.rows).toHaveLength(first.workflowCount);
    expect(first.findings).toEqual([]);
    expect(first.hasErrors).toBe(false);
    expect(first.hasWarnings).toBe(false);
  });

  it("supports audit reports in every performance mode without permission drift", () => {
    for (const performanceMode of AGENT_PERFORMANCE_MODES) {
      const report = buildAgentPolicyAuditReport(performanceMode);

      expect(report.performanceMode).toBe(performanceMode);
      expect(report.workflowCount).toBe(AGENT_WORKFLOWS.length);
      expect(report.findings.map((finding) => finding.code)).not.toContain(
        "permission_mode_drift"
      );
      expect(report.findings.map((finding) => finding.code)).not.toContain(
        "registry_permission_mismatch"
      );
      expect(report.hasErrors).toBe(false);
    }
  });

  it("keeps audit finding codes stable and deterministic", () => {
    const deepSynthesisFindings = buildAgentPolicyAuditRow("deep_synthesis")?.findings;
    const featureSprintFindings = buildAgentPolicyAuditRow("feature_sprint_runner")?.findings;

    expect(deepSynthesisFindings).toEqual([
      {
        severity: "info",
        code: "workflow_provider_enabled",
        workflowId: "deep_synthesis",
        message: "Workflow uses provider surface ai_gateway."
      },
      {
        severity: "info",
        code: "workflow_proposal_only",
        workflowId: "deep_synthesis",
        message: "Workflow can produce proposals only."
      },
      {
        severity: "info",
        code: "workflow_user_approved",
        workflowId: "deep_synthesis",
        message: "Workflow requires user approval for policy-permitted mutations."
      }
    ]);
    expect(featureSprintFindings?.map((finding) => finding.code)).toEqual([
      "workflow_provider_enabled",
      "workflow_external_agent_scope"
    ]);
  });

  it("keeps audit permissions invariant across performance modes", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      const balanced = buildAgentPolicyAuditRow(workflow.id, "balanced");

      for (const performanceMode of AGENT_PERFORMANCE_MODES) {
        const row = buildAgentPolicyAuditRow(workflow.id, performanceMode);

        expect(row?.providerSurface).toBe(balanced?.providerSurface);
        expect(row?.contextSources).toEqual(balanced?.contextSources);
        expect(row?.mutationPolicy).toBe(balanced?.mutationPolicy);
        expect(row?.containment).toBe(balanced?.containment);
      }
    }
  });

  it("returns compact stable allow and deny decisions", () => {
    expect(
      checkAgentPolicyProviderSurface({
        workflowId: "chat_harness",
        providerSurface: "ai_gateway"
      })
    ).toEqual({
      allowed: true,
      reason: "allowed_by_policy",
      workflowId: "chat_harness",
      performanceMode: "balanced",
      detail: "Provider surface ai_gateway is allowed by policy."
    });

    expect(
      checkAgentPolicyProviderSurface({
        workflowId: "chat_harness",
        providerSurface: "feature_sprint_runner"
      })
    ).toEqual({
      allowed: false,
      reason: "provider_surface_denied",
      workflowId: "chat_harness",
      performanceMode: "balanced",
      detail:
        "Requested provider surface feature_sprint_runner does not match policy surface ai_gateway."
    });
  });

  it("denies unknown workflows without throwing", () => {
    const unknown = "missing_workflow" as AgentWorkflowId;

    expect(
      checkAgentPolicyOperation({
        workflowId: unknown,
        providerSurface: "ai_gateway"
      })
    ).toEqual({
      allowed: false,
      reason: "workflow_unknown",
      workflowId: "missing_workflow",
      performanceMode: "balanced",
      detail: "Workflow missing_workflow is not registered."
    });
  });

  it("checks provider surface permissions", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      expect(
        checkAgentPolicyProviderSurface({
          workflowId: workflow.id,
          providerSurface: workflow.providerSurface
        }).allowed
      ).toBe(true);
    }

    expect(
      checkAgentPolicyProviderSurface({
        workflowId: "context_packet_build",
        providerSurface: "ai_gateway"
      }).reason
    ).toBe("provider_surface_denied");
    expect(
      checkAgentPolicyProviderSurface({
        workflowId: "raw_lab",
        providerSurface: "feature_sprint_runner"
      }).reason
    ).toBe("provider_surface_denied");
    expect(
      checkAgentPolicyProviderSurface({
        workflowId: "feature_sprint_runner",
        providerSurface: "ai_gateway"
      }).reason
    ).toBe("provider_surface_denied");
  });

  it("checks context source permissions", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      for (const contextSource of workflow.contextSources) {
        expect(
          checkAgentPolicyContextSource({
            workflowId: workflow.id,
            contextSource
          }).allowed
        ).toBe(true);
      }
    }

    expect(
      checkAgentPolicyContextSource({
        workflowId: "raw_lab",
        contextSource: "board_snapshot"
      }).reason
    ).toBe("context_source_denied");
    expect(
      checkAgentPolicyContextSource({
        workflowId: "chat_harness",
        contextSource: "raw_lab_thread_state"
      }).reason
    ).toBe("context_source_denied");
    expect(
      checkAgentPolicyContextSource({
        workflowId: "deep_synthesis",
        contextSource: "raw_lab_turns"
      }).reason
    ).toBe("context_source_denied");
  });

  it("checks mutation permissions", () => {
    expect(checkAgentPolicyMutation({ workflowId: "raw_lab", mutation: "direct_mutation" }).reason).toBe(
      "mutation_denied"
    );
    expect(checkAgentPolicyMutation({ workflowId: "raw_lab", mutation: "user_approved_action" }).reason).toBe(
      "mutation_denied"
    );
    expect(checkAgentPolicyMutation({ workflowId: "deep_synthesis", mutation: "proposal" }).allowed).toBe(
      true
    );
    expect(
      checkAgentPolicyMutation({ workflowId: "deep_synthesis", mutation: "direct_mutation" }).reason
    ).toBe("mutation_denied");
    expect(
      checkAgentPolicyMutation({ workflowId: "chat_harness", mutation: "user_approved_action" })
        .allowed
    ).toBe(true);
    expect(
      checkAgentPolicyMutation({ workflowId: "chat_harness", mutation: "direct_mutation" }).reason
    ).toBe("mutation_denied");
    expect(
      checkAgentPolicyMutation({ workflowId: "context_packet_build", mutation: "proposal" }).reason
    ).toBe("mutation_denied");
    expect(
      checkAgentPolicyMutation({
        workflowId: "feature_sprint_runner",
        mutation: "external_agent_scope"
      }).allowed
    ).toBe(true);
  });

  it("checks containment boundaries", () => {
    expect(checkAgentPolicyContainment({ workflowId: "raw_lab", containment: "raw_lab_isolated" }).allowed).toBe(
      true
    );
    expect(checkAgentPolicyContainment({ workflowId: "raw_lab", containment: "board_context" }).reason).toBe(
      "containment_denied"
    );
    expect(
      checkAgentPolicyContainment({ workflowId: "raw_lab", containment: "board_persistence" })
        .reason
    ).toBe("containment_denied");
    expect(
      checkAgentPolicyContainment({
        workflowId: "chat_harness",
        containment: "raw_lab_runtime_authority"
      }).reason
    ).toBe("containment_denied");
    expect(
      checkAgentPolicyContainment({
        workflowId: "feature_sprint_runner",
        containment: "dev_agent"
      }).allowed
    ).toBe(true);
    expect(
      checkAgentPolicyContainment({
        workflowId: "deep_synthesis",
        containment: "companion_runtime_authority"
      }).allowed
    ).toBe(true);
  });

  it("checks aggregate operations in stable denial order", () => {
    expect(
      checkAgentPolicyOperation({
        workflowId: "chat_harness",
        providerSurface: "ai_gateway",
        contextSource: "board_snapshot",
        mutation: "user_approved_action",
        containment: "grounded"
      }).allowed
    ).toBe(true);

    expect(checkAgentPolicyOperation({ workflowId: "chat_harness" })).toEqual({
      allowed: true,
      reason: "allowed_by_policy",
      workflowId: "chat_harness",
      performanceMode: "balanced",
      detail: "Operation request is allowed by policy."
    });

    expect(
      checkAgentPolicyOperation({
        workflowId: "chat_harness",
        providerSurface: "feature_sprint_runner",
        contextSource: "raw_lab_turns",
        mutation: "direct_mutation",
        containment: "raw_lab_runtime_authority"
      }).reason
    ).toBe("provider_surface_denied");
    expect(
      checkAgentPolicyOperation({
        workflowId: "chat_harness",
        providerSurface: "ai_gateway",
        contextSource: "raw_lab_turns",
        mutation: "direct_mutation",
        containment: "raw_lab_runtime_authority"
      }).reason
    ).toBe("context_source_denied");
    expect(
      checkAgentPolicyOperation({
        workflowId: "chat_harness",
        providerSurface: "ai_gateway",
        contextSource: "board_snapshot",
        mutation: "direct_mutation",
        containment: "raw_lab_runtime_authority"
      }).reason
    ).toBe("mutation_denied");
    expect(
      checkAgentPolicyOperation({
        workflowId: "chat_harness",
        providerSurface: "ai_gateway",
        contextSource: "board_snapshot",
        mutation: "user_approved_action",
        containment: "raw_lab_runtime_authority"
      }).reason
    ).toBe("containment_denied");
  });

  it("keeps policy guard decisions invariant across performance modes", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      const providerReasons = new Set(
        AGENT_PERFORMANCE_MODES.map(
          (performanceMode) =>
            checkAgentPolicyProviderSurface({
              workflowId: workflow.id,
              performanceMode,
              providerSurface: workflow.providerSurface
            }).reason
        )
      );
      expect(providerReasons).toEqual(new Set(["allowed_by_policy"]));

      const deniedProviderReasons = new Set(
        AGENT_PERFORMANCE_MODES.map(
          (performanceMode) =>
            checkAgentPolicyProviderSurface({
              workflowId: workflow.id,
              performanceMode,
              providerSurface:
                workflow.providerSurface === "ai_gateway" ? "none" : "ai_gateway"
            }).reason
        )
      );
      expect(deniedProviderReasons.size).toBe(1);

      const firstContextSource = workflow.contextSources[0];
      const contextReasons = new Set(
        AGENT_PERFORMANCE_MODES.map(
          (performanceMode) =>
            checkAgentPolicyContextSource({
              workflowId: workflow.id,
              performanceMode,
              contextSource: firstContextSource
            }).reason
        )
      );
      expect(contextReasons).toEqual(new Set(["allowed_by_policy"]));

      const mutationReasons = new Set(
        AGENT_PERFORMANCE_MODES.map(
          (performanceMode) =>
            checkAgentPolicyMutation({
              workflowId: workflow.id,
              performanceMode,
              mutation: "direct_mutation"
            }).reason
        )
      );
      expect(mutationReasons.size).toBe(1);

      const containmentReasons = new Set(
        AGENT_PERFORMANCE_MODES.map(
          (performanceMode) =>
            checkAgentPolicyContainment({
              workflowId: workflow.id,
              performanceMode,
              containment: workflow.containment
            }).reason
        )
      );
      expect(containmentReasons).toEqual(new Set(["allowed_by_policy"]));
    }
  });
});
