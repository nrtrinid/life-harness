import { describe, expect, it } from "vitest";

import {
  AGENT_MUTATION_POLICIES,
  AGENT_WORKFLOWS,
  getAgentWorkflowDefinition,
  listAgentWorkflowDefinitions,
  listGatewayAgentWorkflows,
  listIsolatedAgentWorkflows,
  listMutableAgentWorkflows,
  type AgentWorkflowDefinition
} from "./agentWorkflowRegistry";

const CANONICAL_GATEWAY_ENDPOINTS = [
  "POST /chat-harness",
  "POST /ask-harness",
  "POST /ai/deep-synthesis",
  "POST /ai/deep-synthesis-jobs",
  "GET /ai/jobs/{id}",
  "POST /raw-lab",
  "POST /raw-lab/stream",
  "POST /raw-lab/self-reflection",
  "POST /raw-lab/reflect-thread",
  "POST /analyze-transcript",
  "GET /health"
] as const;

function requireDefinition(id: AgentWorkflowDefinition["id"]): AgentWorkflowDefinition {
  const definition = getAgentWorkflowDefinition(id);
  expect(definition).toBeDefined();
  return definition!;
}

describe("agentWorkflowRegistry", () => {
  it("has unique workflow IDs", () => {
    const ids = AGENT_WORKFLOWS.map((workflow) => workflow.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires label, kind, mutation policy, containment, and status on every workflow", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      expect(workflow.label.trim().length).toBeGreaterThan(0);
      expect(workflow.kind.trim().length).toBeGreaterThan(0);
      expect(workflow.mutationPolicy.trim().length).toBeGreaterThan(0);
      expect(workflow.containment.trim().length).toBeGreaterThan(0);
      expect(workflow.status.trim().length).toBeGreaterThan(0);
      expect(workflow.coreFiles.length).toBeGreaterThan(0);
    }
  });

  it("marks Raw Lab gateway workflows as raw_lab_isolated", () => {
    const rawLabWorkflows = AGENT_WORKFLOWS.filter((workflow) => workflow.id.startsWith("raw_lab"));
    expect(rawLabWorkflows.length).toBeGreaterThan(0);
    for (const workflow of rawLabWorkflows) {
      expect(workflow.containment).toBe("raw_lab_isolated");
    }
  });

  it("uses defaultModelTier none for deterministic_rules workflows", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      if (workflow.kind === "deterministic_rules") {
        expect(workflow.defaultModelTier).toBe("none");
      }
    }
  });

  it("uses defaultModelTier none for selected non-LLM gateway and runner workflows", () => {
    for (const id of ["gateway_health", "ai_job_status", "job_scout_runner"] as const) {
      expect(requireDefinition(id).defaultModelTier).toBe("none");
    }
  });

  it("never uses an unrestricted mutation policy", () => {
    for (const workflow of AGENT_WORKFLOWS) {
      expect(AGENT_MUTATION_POLICIES).toContain(workflow.mutationPolicy);
      expect(workflow.mutationPolicy).not.toBe("unrestricted" as AgentWorkflowDefinition["mutationPolicy"]);
    }

    const llmWriteCapable = AGENT_WORKFLOWS.filter(
      (workflow) =>
        workflow.providerSurface === "ai_gateway" &&
        workflow.kind !== "gateway_utility" &&
        workflow.status !== "doc_only" &&
        workflow.status !== "stale"
    );

    for (const workflow of llmWriteCapable) {
      if (workflow.mutationPolicy !== "none") {
        continue;
      }
      const allowedReadOnly =
        workflow.id.startsWith("raw_lab") ||
        workflow.id === "analyze_transcript" ||
        workflow.kind === "gateway_job";
      expect(allowedReadOnly).toBe(true);
    }
  });

  it("requires user-approved actions for Chat Harness", () => {
    expect(requireDefinition("chat_harness").mutationPolicy).toBe("user_approved_actions_only");
  });

  it("scopes Feature Sprint runner as external dev-agent worktree workflow", () => {
    const runner = requireDefinition("feature_sprint_runner");
    expect(runner.providerSurface).toBe("feature_sprint_runner");
    expect(runner.containment).toBe("dev_agent");
    expect(runner.mutationPolicy).toBe("external_agent_scoped");
    expect(runner.endpoint).toBe("POST /feature-sprint/run");
    expect(runner.defaultModelTier).toBe("external_frontier");
  });

  it("requires proposals-only mutation for Deep Synthesis workflows", () => {
    expect(requireDefinition("deep_synthesis").mutationPolicy).toBe("user_approved_proposals_only");
    expect(requireDefinition("deep_synthesis_job").mutationPolicy).toBe(
      "user_approved_proposals_only"
    );
  });

  it("covers every implemented gateway endpoint except dev playground", () => {
    for (const endpoint of CANONICAL_GATEWAY_ENDPOINTS) {
      const matches = AGENT_WORKFLOWS.filter(
        (workflow) =>
          workflow.providerSurface === "ai_gateway" &&
          workflow.endpoint === endpoint &&
          workflow.status !== "doc_only"
      );
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it("lists helper views consistently", () => {
    expect(listAgentWorkflowDefinitions()).toHaveLength(AGENT_WORKFLOWS.length);
    expect(listGatewayAgentWorkflows().every((w) => w.providerSurface === "ai_gateway")).toBe(true);
    expect(listIsolatedAgentWorkflows().every((w) => w.containment === "raw_lab_isolated")).toBe(
      true
    );
    expect(
      listMutableAgentWorkflows().every((workflow) => workflow.mutationPolicy !== "none")
    ).toBe(true);
  });
});
