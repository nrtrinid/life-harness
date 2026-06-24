export type AgentWorkflowId =
  | "chat_harness"
  | "ask_harness_legacy"
  | "deep_synthesis"
  | "deep_synthesis_job"
  | "ai_job_status"
  | "raw_lab"
  | "raw_lab_stream"
  | "raw_lab_self_reflection"
  | "raw_lab_thread_reflection"
  | "analyze_transcript"
  | "gateway_health"
  | "gateway_playground"
  | "feature_sprint_runner"
  | "feature_sprint_worktree_cleanup"
  | "job_scout_runner"
  | "context_packet_build"
  | "memory_bank"
  | "feature_sprint_orchestrator"
  | "agent_workbench"
  | "career_source_pack"
  | "assistant_actions_apply"
  | "raw_lab_companion_handoff";

export type AgentWorkflowKind =
  | "gateway_chat"
  | "gateway_synthesis"
  | "gateway_job"
  | "gateway_utility"
  | "external_agent_runner"
  | "deterministic_rules";

export type AgentContextSourceId =
  | "board_snapshot"
  | "context_packet"
  | "conversation_history"
  | "thread_state"
  | "memory_bank"
  | "chat_summary"
  | "raw_lab_turns"
  | "raw_lab_thread_state"
  | "companion_self_memories"
  | "transcript_text"
  | "repo_worktree"
  | "job_source_config"
  | "local_state_only";

export type AgentMutationPolicy =
  | "none"
  | "user_approved_actions_only"
  | "user_approved_proposals_only"
  | "external_agent_scoped";

export type AgentContainmentType =
  | "grounded"
  | "raw_lab_isolated"
  | "dev_agent"
  | "deterministic_local";

export type AgentModelTier =
  | "none"
  | "companion_fast"
  | "critic_small"
  | "stretch_batch"
  | "coder_daily"
  | "external_frontier";

export type AgentWorkflowStatus =
  | "implemented"
  | "partial"
  | "doc_only"
  | "test_only"
  | "stale";

export type AgentProviderSurface =
  | "ai_gateway"
  | "feature_sprint_runner"
  | "job_scout_runner"
  | "none";

export type AgentWorkflowDefinition = {
  id: AgentWorkflowId;
  label: string;
  kind: AgentWorkflowKind;
  status: AgentWorkflowStatus;
  contextSources: AgentContextSourceId[];
  mutationPolicy: AgentMutationPolicy;
  containment: AgentContainmentType;
  defaultModelTier: AgentModelTier;
  providerSurface: AgentProviderSurface;
  userRoute?: string;
  endpoint?: string;
  coreFiles: string[];
  testFiles: string[];
  notes?: string;
};

export const AGENT_MUTATION_POLICIES: readonly AgentMutationPolicy[] = [
  "none",
  "user_approved_actions_only",
  "user_approved_proposals_only",
  "external_agent_scoped"
] as const;

export const AGENT_WORKFLOWS: readonly AgentWorkflowDefinition[] = [
  {
    id: "chat_harness",
    label: "Companion (Chat Harness)",
    kind: "gateway_chat",
    status: "implemented",
    contextSources: [
      "board_snapshot",
      "context_packet",
      "conversation_history",
      "thread_state",
      "memory_bank",
      "chat_summary"
    ],
    mutationPolicy: "user_approved_actions_only",
    containment: "grounded",
    defaultModelTier: "companion_fast",
    providerSurface: "ai_gateway",
    userRoute: "/ask-harness",
    endpoint: "POST /chat-harness",
    coreFiles: [
      "app/ask-harness.tsx",
      "src/core/chatHarnessClient.ts",
      "src/core/chatHarnessSendBudget.ts",
      "src/core/contextPacketBuilder.ts",
      "src/core/chatThreadState.ts",
      "src/core/assistantActionRegistry.ts"
    ],
    testFiles: [
      "src/core/chatHarnessClient.test.ts",
      "src/core/chatHarnessSendBudget.test.ts",
      "src/core/askHarness.containment.test.ts",
      "src/core/contextPacketBuilder.test.ts"
    ],
    notes: "Primary grounded scout chat. Deep reasoning may invoke critic_small when SCOUT_DEEP_ENABLED. Gateway routing authority: services/ai-gateway/app/orchestrator/depth_routing.py"
  },
  {
    id: "ask_harness_legacy",
    label: "Ask Harness (legacy endpoint)",
    kind: "gateway_chat",
    status: "stale",
    contextSources: [
      "board_snapshot",
      "conversation_history",
      "thread_state"
    ],
    mutationPolicy: "none",
    containment: "grounded",
    defaultModelTier: "companion_fast",
    providerSurface: "ai_gateway",
    endpoint: "POST /ask-harness",
    coreFiles: [
      "services/ai-gateway/app/main.py",
      "services/ai-gateway/app/prompts/ask_harness.md"
    ],
    testFiles: ["services/ai-gateway/tests/test_ask_harness_contract.py"],
    notes: "Gateway endpoint retained; Expo app uses POST /chat-harness instead."
  },
  {
    id: "deep_synthesis",
    label: "Deep Synthesis (inline)",
    kind: "gateway_synthesis",
    status: "implemented",
    contextSources: [
      "board_snapshot",
      "context_packet",
      "conversation_history",
      "thread_state",
      "memory_bank",
      "chat_summary"
    ],
    mutationPolicy: "user_approved_proposals_only",
    containment: "grounded",
    defaultModelTier: "companion_fast",
    providerSurface: "ai_gateway",
    userRoute: "/ask-harness",
    endpoint: "POST /ai/deep-synthesis",
    coreFiles: [
      "src/core/askHarnessSynthesis.ts",
      "src/core/deepSynthesisClient.ts",
      "services/ai-gateway/app/deep_synthesis.py",
      "services/ai-gateway/app/synthesis_verifier.py"
    ],
    testFiles: [
      "src/core/askHarnessSynthesis.test.ts",
      "src/core/deepSynthesisClient.test.ts",
      "services/ai-gateway/tests/test_deep_synthesis_mock.py"
    ],
    notes: "Fast path completes inline. Memory/personality proposals require user approval. Gateway routing authority: services/ai-gateway/app/orchestrator/depth_routing.py"
  },
  {
    id: "deep_synthesis_job",
    label: "Deep Synthesis (async job)",
    kind: "gateway_synthesis",
    status: "implemented",
    contextSources: [
      "board_snapshot",
      "context_packet",
      "conversation_history",
      "thread_state",
      "memory_bank",
      "chat_summary"
    ],
    mutationPolicy: "user_approved_proposals_only",
    containment: "grounded",
    defaultModelTier: "critic_small",
    providerSurface: "ai_gateway",
    userRoute: "/ask-harness",
    endpoint: "POST /ai/deep-synthesis-jobs",
    coreFiles: [
      "src/core/deepSynthesisClient.ts",
      "src/core/aiJobClient.ts",
      "services/ai-gateway/app/synthesis_jobs.py"
    ],
    testFiles: [
      "src/core/aiJobClient.test.ts",
      "services/ai-gateway/tests/test_deep_synthesis_jobs.py"
    ],
    notes:
      "with_critic uses critic_small when configured; with_stretch is partially mock-simulated (stretch_batch slot disabled)."
  },
  {
    id: "ai_job_status",
    label: "AI job status poll",
    kind: "gateway_job",
    status: "implemented",
    contextSources: ["local_state_only"],
    mutationPolicy: "none",
    containment: "grounded",
    defaultModelTier: "none",
    providerSurface: "ai_gateway",
    endpoint: "GET /ai/jobs/{id}",
    coreFiles: ["src/core/aiJobClient.ts", "services/ai-gateway/app/synthesis_jobs.py"],
    testFiles: ["src/core/aiJobClient.test.ts", "services/ai-gateway/tests/test_deep_synthesis_jobs.py"]
  },
  {
    id: "raw_lab",
    label: "Raw Signal (Raw Lab)",
    kind: "gateway_chat",
    status: "implemented",
    contextSources: [
      "raw_lab_turns",
      "raw_lab_thread_state",
      "companion_self_memories"
    ],
    mutationPolicy: "none",
    containment: "raw_lab_isolated",
    defaultModelTier: "companion_fast",
    providerSurface: "ai_gateway",
    userRoute: "/raw-lab",
    endpoint: "POST /raw-lab",
    coreFiles: [
      "app/raw-lab.tsx",
      "src/core/rawLabClient.ts",
      "src/core/rawLabContextBudget.ts",
      "src/core/rawLabThreadState.ts"
    ],
    testFiles: [
      "src/core/rawLabClient.test.ts",
      "src/core/rawLabScreen.containment.test.ts",
      "services/ai-gateway/tests/test_raw_lab_contract.py"
    ],
    notes: "No board context, Memory Bank authority, or mutation path."
  },
  {
    id: "raw_lab_stream",
    label: "Raw Lab streaming",
    kind: "gateway_chat",
    status: "partial",
    contextSources: [
      "raw_lab_turns",
      "raw_lab_thread_state",
      "companion_self_memories"
    ],
    mutationPolicy: "none",
    containment: "raw_lab_isolated",
    defaultModelTier: "companion_fast",
    providerSurface: "ai_gateway",
    userRoute: "/raw-lab",
    endpoint: "POST /raw-lab/stream",
    coreFiles: ["src/core/rawLabClient.ts"],
    testFiles: ["services/ai-gateway/tests/test_raw_lab_stream_contract.py"],
    notes: "SSE chunks full answer post-hoc; not true token streaming."
  },
  {
    id: "raw_lab_self_reflection",
    label: "Raw Lab self-reflection",
    kind: "gateway_chat",
    status: "implemented",
    contextSources: [
      "raw_lab_turns",
      "raw_lab_thread_state",
      "companion_self_memories"
    ],
    mutationPolicy: "user_approved_proposals_only",
    containment: "raw_lab_isolated",
    defaultModelTier: "companion_fast",
    providerSurface: "ai_gateway",
    userRoute: "/raw-lab",
    endpoint: "POST /raw-lab/self-reflection",
    coreFiles: ["src/core/rawLabSelfReflectionClient.ts"],
    testFiles: ["services/ai-gateway/tests/test_raw_lab_self_memory_contract.py"]
  },
  {
    id: "raw_lab_thread_reflection",
    label: "Raw Lab thread reflection",
    kind: "gateway_chat",
    status: "implemented",
    contextSources: [
      "raw_lab_turns",
      "raw_lab_thread_state",
      "companion_self_memories"
    ],
    mutationPolicy: "user_approved_proposals_only",
    containment: "raw_lab_isolated",
    defaultModelTier: "companion_fast",
    providerSurface: "ai_gateway",
    userRoute: "/raw-lab",
    endpoint: "POST /raw-lab/reflect-thread",
    coreFiles: [
      "src/core/rawLabThreadReflectionClient.ts",
      "services/ai-gateway/app/raw_lab_thread_reflection.py"
    ],
    testFiles: ["services/ai-gateway/tests/test_raw_lab_thread_reflection_contract.py"]
  },
  {
    id: "analyze_transcript",
    label: "Transcript analysis",
    kind: "gateway_chat",
    status: "partial",
    contextSources: ["transcript_text"],
    mutationPolicy: "none",
    containment: "grounded",
    defaultModelTier: "companion_fast",
    providerSurface: "ai_gateway",
    endpoint: "POST /analyze-transcript",
    coreFiles: [
      "services/ai-gateway/app/main.py",
      "services/ai-gateway/scripts/analyze_file.py"
    ],
    testFiles: ["services/ai-gateway/tests/test_contracts.py"],
    notes: "Gateway and CLI scripts only; no Expo app client or UI."
  },
  {
    id: "gateway_health",
    label: "Gateway health and budget",
    kind: "gateway_utility",
    status: "implemented",
    contextSources: ["local_state_only"],
    mutationPolicy: "none",
    containment: "deterministic_local",
    defaultModelTier: "none",
    providerSurface: "ai_gateway",
    endpoint: "GET /health",
    coreFiles: ["src/core/gatewayHealthClient.ts", "src/core/gatewayBudget.ts"],
    testFiles: ["src/core/gatewayHealthClient.test.ts", "services/ai-gateway/tests/test_health_slots.py"]
  },
  {
    id: "gateway_playground",
    label: "Ask Harness playground (dev)",
    kind: "gateway_utility",
    status: "doc_only",
    contextSources: ["board_snapshot"],
    mutationPolicy: "none",
    containment: "deterministic_local",
    defaultModelTier: "none",
    providerSurface: "ai_gateway",
    endpoint: "GET /playground",
    coreFiles: ["services/ai-gateway/playground/ask_harness.html"],
    testFiles: ["services/ai-gateway/tests/test_playground.py"],
    notes: "Dev-only HTML playground; not a product surface."
  },
  {
    id: "feature_sprint_runner",
    label: "Feature Sprint runner",
    kind: "external_agent_runner",
    status: "implemented",
    contextSources: ["repo_worktree", "local_state_only"],
    mutationPolicy: "external_agent_scoped",
    containment: "dev_agent",
    defaultModelTier: "external_frontier",
    providerSurface: "feature_sprint_runner",
    userRoute: "/card/[id]",
    endpoint: "POST /feature-sprint/run",
    coreFiles: [
      "src/core/featureSprintRunnerClient.ts",
      "src/core/featureSprintRunnerHistory.ts",
      "services/feature-sprint-runner/src/runPacket.ts"
    ],
    testFiles: [
      "services/feature-sprint-runner/tests/runner.test.ts",
      "src/core/featureSprintRunnerHistory.test.ts"
    ],
    notes: "Spawns Codex or Cursor CLI in worktree; app stores run record; user approves imports."
  },
  {
    id: "feature_sprint_worktree_cleanup",
    label: "Feature Sprint worktree cleanup",
    kind: "external_agent_runner",
    status: "implemented",
    contextSources: ["repo_worktree"],
    mutationPolicy: "external_agent_scoped",
    containment: "dev_agent",
    defaultModelTier: "none",
    providerSurface: "feature_sprint_runner",
    endpoint: "POST /feature-sprint/cleanup-worktree",
    coreFiles: [
      "src/core/featureSprintRunnerClient.ts",
      "services/feature-sprint-runner/src/worktreeCleanup.ts"
    ],
    testFiles: ["services/feature-sprint-runner/tests/worktreeCleanup.test.ts"]
  },
  {
    id: "job_scout_runner",
    label: "Job Scout runner",
    kind: "deterministic_rules",
    status: "implemented",
    contextSources: ["job_source_config", "local_state_only"],
    mutationPolicy: "none",
    containment: "deterministic_local",
    defaultModelTier: "none",
    providerSurface: "job_scout_runner",
    userRoute: "/job-sources",
    endpoint: "POST /run-source",
    coreFiles: [
      "src/core/jobScoutRunnerClient.ts",
      "src/core/jobSourceRunner.ts",
      "services/job-scout-runner/src/server.ts"
    ],
    testFiles: [
      "src/core/jobScoutRunnerClient.test.ts",
      "services/job-scout-runner/tests/runner.test.ts"
    ],
    notes: "Fetch and parse only; no LLM. Candidates require user approval flow."
  },
  {
    id: "context_packet_build",
    label: "Context packet builder",
    kind: "deterministic_rules",
    status: "implemented",
    contextSources: [
      "board_snapshot",
      "memory_bank",
      "chat_summary",
      "thread_state"
    ],
    mutationPolicy: "none",
    containment: "deterministic_local",
    defaultModelTier: "none",
    providerSurface: "none",
    coreFiles: [
      "src/core/contextPacketBuilder.ts",
      "src/core/contextPacketRanking.ts",
      "src/core/contextPacketRedaction.ts",
      "src/core/contextPacketWire.ts"
    ],
    testFiles: [
      "src/core/contextPacketBuilder.test.ts",
      "src/core/contextPacketRedaction.test.ts",
      "src/core/contextPacketWire.test.ts"
    ],
    notes: "Client-side ranked context for grounded gateway workflows."
  },
  {
    id: "memory_bank",
    label: "Memory Bank",
    kind: "deterministic_rules",
    status: "implemented",
    contextSources: ["local_state_only", "chat_summary"],
    mutationPolicy: "none",
    containment: "deterministic_local",
    defaultModelTier: "none",
    providerSurface: "none",
    userRoute: "/memory-bank",
    coreFiles: ["src/core/harnessMemoryBank.ts", "app/memory-bank.tsx"],
    testFiles: ["src/core/harnessMemoryBank.test.ts"],
    notes: "User-approved durable memories; feeds Companion context when active."
  },
  {
    id: "feature_sprint_orchestrator",
    label: "Feature Sprint orchestrator",
    kind: "deterministic_rules",
    status: "implemented",
    contextSources: ["board_snapshot", "local_state_only"],
    mutationPolicy: "none",
    containment: "deterministic_local",
    defaultModelTier: "none",
    providerSurface: "none",
    userRoute: "/feature-sprints",
    coreFiles: [
      "src/core/featureSprintOrchestrator.ts",
      "src/core/featureSprintDogfood.ts",
      "src/core/featureSprintImplementationProof.ts"
    ],
    testFiles: [
      "src/core/featureSprintOrchestrator.test.ts",
      "src/core/featureSprintDogfood.test.ts"
    ],
    notes: "Rules-only plan/review state machine; S3 cards blocked."
  },
  {
    id: "agent_workbench",
    label: "Agent Workbench",
    kind: "deterministic_rules",
    status: "implemented",
    contextSources: ["board_snapshot", "local_state_only"],
    mutationPolicy: "none",
    containment: "deterministic_local",
    defaultModelTier: "none",
    providerSurface: "none",
    userRoute: "/agent-workbench",
    coreFiles: [
      "src/core/agentWorkbench.ts",
      "src/core/agentTaskPacket.ts",
      "src/core/agentSessionLog.ts",
      "app/agent-workbench.tsx"
    ],
    testFiles: [],
    notes: "Manual task packet copy and session logging; no model calls."
  },
  {
    id: "career_source_pack",
    label: "Career Source Pack import",
    kind: "deterministic_rules",
    status: "implemented",
    contextSources: ["local_state_only"],
    mutationPolicy: "none",
    containment: "deterministic_local",
    defaultModelTier: "none",
    providerSurface: "none",
    userRoute: "/career-pack",
    coreFiles: ["src/core/careerSourcePack.ts", "src/core/careerSourcePackBuilder.ts"],
    testFiles: ["src/core/careerSourcePack.test.ts", "src/core/careerSourcePackLocal.test.ts"],
    notes: "JSON/markdown import; no LLM."
  },
  {
    id: "assistant_actions_apply",
    label: "Assistant actions (post-process)",
    kind: "deterministic_rules",
    status: "implemented",
    contextSources: ["board_snapshot", "local_state_only"],
    mutationPolicy: "user_approved_actions_only",
    containment: "grounded",
    defaultModelTier: "none",
    providerSurface: "none",
    coreFiles: ["src/core/assistantActionRegistry.ts"],
    testFiles: ["services/ai-gateway/tests/test_chat_harness_assistant_actions_prompt.py"],
    notes: "Parses chat_harness output fences; user must approve before board mutation."
  },
  {
    id: "raw_lab_companion_handoff",
    label: "Raw Lab → Companion handoff",
    kind: "deterministic_rules",
    status: "implemented",
    contextSources: ["raw_lab_turns"],
    mutationPolicy: "none",
    containment: "raw_lab_isolated",
    defaultModelTier: "none",
    providerSurface: "none",
    userRoute: "/raw-lab",
    coreFiles: ["app/raw-lab.tsx", "app/ask-harness.tsx"],
    testFiles: ["src/core/askHarness.containment.test.ts"],
    notes: "Explicit user action; sanitized digest navigates to Companion; no gateway call."
  }
] as const;

const WORKFLOW_BY_ID = new Map<AgentWorkflowId, AgentWorkflowDefinition>(
  AGENT_WORKFLOWS.map((workflow) => [workflow.id, workflow])
);

export function getAgentWorkflowDefinition(
  id: AgentWorkflowId
): AgentWorkflowDefinition | undefined {
  return WORKFLOW_BY_ID.get(id);
}

export function listAgentWorkflowDefinitions(): AgentWorkflowDefinition[] {
  return [...AGENT_WORKFLOWS].sort((left, right) => left.id.localeCompare(right.id));
}

export function listMutableAgentWorkflows(): AgentWorkflowDefinition[] {
  return AGENT_WORKFLOWS.filter((workflow) => workflow.mutationPolicy !== "none");
}

export function listGatewayAgentWorkflows(): AgentWorkflowDefinition[] {
  return AGENT_WORKFLOWS.filter((workflow) => workflow.providerSurface === "ai_gateway");
}

export function listIsolatedAgentWorkflows(): AgentWorkflowDefinition[] {
  return AGENT_WORKFLOWS.filter((workflow) => workflow.containment === "raw_lab_isolated");
}
