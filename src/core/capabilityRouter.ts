import type { ThreadTaskMode } from "./chatThreadState";
import { isPounceOrNextActionIntent } from "./contextPacketRanking";
import type { ToolPermission } from "./contextPacket";
import type { ChatHarnessMode } from "./harnessContext";
import type { AssistantActionKind } from "./assistantActionRegistry";
import type { SensitivityLevel } from "./types";
import type { UntrustedContextSourceKind } from "./untrustedContextBlock";
import { UNTRUSTED_CONTEXT_BANNER, PASTED_EXTERNAL_MIN_CHARS } from "./untrustedContextBlock";

export { PASTED_EXTERNAL_MIN_CHARS } from "./untrustedContextBlock";

export type HarnessRoute =
  | "companion"
  | "deep_synthesis"
  | "raw_lab"
  | "feature_sprint_packet";

export type HarnessCapability =
  | "read_board"
  | "read_memory"
  | "read_thread"
  | "inspect_context"
  | "quick_capture"
  | "log_win"
  | "park_card"
  | "update_next_tiny_action"
  | "create_agent_session"
  | "career_pack"
  | "resume_bank"
  | "docx_export"
  | "job_post_context"
  | "job_source_debug"
  | "feature_sprint"
  | "repo_context"
  | "test_summary"
  | "runner_health"
  | "deep_synthesis";

export type RoutingIntent =
  | "career_tailor"
  | "feature_sprint"
  | "job_source_debug"
  | "next_move"
  | "general";

export type RoutedCapabilityGroup = {
  id: string;
  reason: string;
  capabilities: HarnessCapability[];
  contextSources: string[];
  requiresApproval: boolean;
};

export type CapabilityRoutingResult = {
  route: HarnessRoute;
  intent: RoutingIntent;
  alwaysOn: HarnessCapability[];
  groups: RoutedCapabilityGroup[];
  allowed: HarnessCapability[];
  denied: HarnessCapability[];
  untrustedHints: { sourceKind: UntrustedContextSourceKind; reason: string }[];
  notes: string[];
};

export type RouteCapabilitiesInput = {
  route: HarnessRoute;
  message: string;
  mode: ChatHarnessMode;
  sensitivity: SensitivityLevel;
  taskMode?: ThreadTaskMode;
};

const ALWAYS_ON_CAPABILITIES: HarnessCapability[] = [
  "read_board",
  "read_memory",
  "read_thread",
  "inspect_context",
  "quick_capture",
  "log_win",
  "park_card",
  "update_next_tiny_action"
];

const ALL_HARNESS_CAPABILITIES: HarnessCapability[] = [
  ...ALWAYS_ON_CAPABILITIES,
  "create_agent_session",
  "career_pack",
  "resume_bank",
  "docx_export",
  "job_post_context",
  "job_source_debug",
  "feature_sprint",
  "repo_context",
  "test_summary",
  "runner_health",
  "deep_synthesis"
];

const CAREER_DENIED: HarnessCapability[] = [
  "feature_sprint",
  "runner_health",
  "repo_context",
  "test_summary",
  "job_source_debug"
];

const FEATURE_SPRINT_DENIED: HarnessCapability[] = [
  "resume_bank",
  "docx_export",
  "job_post_context",
  "job_source_debug",
  "career_pack"
];

const JOB_SOURCE_DENIED: HarnessCapability[] = [
  "feature_sprint",
  "resume_bank",
  "docx_export",
  "job_post_context",
  "career_pack",
  "runner_health",
  "repo_context",
  "test_summary"
];

const NEXT_MOVE_DENIED: HarnessCapability[] = [
  "career_pack",
  "resume_bank",
  "docx_export",
  "job_post_context",
  "job_source_debug",
  "feature_sprint",
  "repo_context",
  "test_summary",
  "runner_health",
  "create_agent_session",
  "deep_synthesis"
];

const TOOL_PERMISSION_BY_CAPABILITY: Partial<Record<HarnessCapability, ToolPermission>> = {
  read_board: "read_board",
  read_memory: "read_memory",
  read_thread: "read_thread",
  quick_capture: "quick_capture",
  log_win: "log_win",
  park_card: "park_card",
  update_next_tiny_action: "update_next_tiny_action",
  create_agent_session: "create_agent_session"
};

const ASSISTANT_ACTION_CAPABILITY: Record<AssistantActionKind, HarnessCapability> = {
  quick_capture: "quick_capture",
  log_win: "log_win",
  park_card: "park_card",
  update_next_tiny_action: "update_next_tiny_action",
  create_agent_session: "create_agent_session"
};

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase();
}

function matchesJobSourceDebug(message: string): boolean {
  return /\b(job source|source runner|source fetch|source config)\b/i.test(message);
}

function matchesFeatureSprint(message: string): boolean {
  if (/\b(feature sprint|implementation packet|worktree|runner health)\b/i.test(message)) {
    return true;
  }
  if (/\brun(ning)? the (next )?feature\b/i.test(message)) {
    return true;
  }
  return /\brunner\b/i.test(message) && /\b(feature|sprint|worktree|implementation)\b/i.test(message);
}

function matchesCareerTailor(message: string): boolean {
  return /\b(resume|tailor|job post|cover letter|docx)\b/i.test(message);
}

function classifyRoutingIntent(input: RouteCapabilitiesInput): RoutingIntent {
  const message = normalizeMessage(input.message);
  if (!message) {
    return "general";
  }
  if (matchesJobSourceDebug(message)) {
    return "job_source_debug";
  }
  if (matchesCareerTailor(message)) {
    return "career_tailor";
  }
  if (matchesFeatureSprint(message)) {
    return "feature_sprint";
  }
  if (isPounceOrNextActionIntent(message, input.mode)) {
    return "next_move";
  }
  return "general";
}

function buildCareerGroup(): RoutedCapabilityGroup {
  return {
    id: "career_tailor",
    reason: "Career tailoring request detected.",
    capabilities: ["career_pack", "resume_bank", "job_post_context", "docx_export"],
    contextSources: ["career_pack", "resume_bank", "job_post"],
    requiresApproval: true
  };
}

function buildFeatureSprintGroup(): RoutedCapabilityGroup {
  return {
    id: "feature_sprint",
    reason: "Feature sprint or runner workflow detected.",
    capabilities: [
      "feature_sprint",
      "repo_context",
      "test_summary",
      "runner_health",
      "create_agent_session"
    ],
    contextSources: ["feature_sprint", "project_registry", "runner_output"],
    requiresApproval: true
  };
}

function buildJobSourceGroup(): RoutedCapabilityGroup {
  return {
    id: "job_source_debug",
    reason: "Job source diagnostics request detected.",
    capabilities: ["job_source_debug"],
    contextSources: ["job_source_runner", "source_logs"],
    requiresApproval: true
  };
}

function buildDeepSynthesisGroup(): RoutedCapabilityGroup {
  return {
    id: "deep_synthesis",
    reason: "Deep Synthesis report request.",
    capabilities: ["deep_synthesis"],
    contextSources: ["context_packet", "thread_state", "proof"],
    requiresApproval: false
  };
}

function buildRoutedGroups(
  intent: RoutingIntent,
  route: HarnessRoute,
  mode: ChatHarnessMode,
  message: string
): RoutedCapabilityGroup[] {
  const groups: RoutedCapabilityGroup[] = [];

  if (route === "deep_synthesis") {
    groups.push(buildDeepSynthesisGroup());
  }

  switch (intent) {
    case "career_tailor":
      groups.push(buildCareerGroup());
      break;
    case "feature_sprint":
      groups.push(buildFeatureSprintGroup());
      break;
    case "job_source_debug":
      groups.push(buildJobSourceGroup());
      break;
    case "next_move":
      break;
    case "general":
      if (mode === "builder" && matchesFeatureSprint(message)) {
        groups.push(buildFeatureSprintGroup());
      }
      break;
  }

  if (
    mode === "builder" &&
    intent !== "next_move" &&
    !groups.some((group) => group.id === "feature_sprint")
  ) {
    groups.push({
      id: "builder_mode",
      reason: "Builder mode enables scoped agent session proposals.",
      capabilities: ["create_agent_session"],
      contextSources: ["active_cards", "project_registry"],
      requiresApproval: true
    });
  }

  return groups;
}

function intentDeniedCapabilities(intent: RoutingIntent): HarnessCapability[] {
  switch (intent) {
    case "career_tailor":
      return CAREER_DENIED;
    case "feature_sprint":
      return FEATURE_SPRINT_DENIED;
    case "job_source_debug":
      return JOB_SOURCE_DENIED;
    case "next_move":
      return NEXT_MOVE_DENIED;
    default:
      return [];
  }
}

function detectPastedExternalHints(message: string): CapabilityRoutingResult["untrustedHints"] {
  const trimmed = message.trim();
  if (trimmed.length < PASTED_EXTERNAL_MIN_CHARS) {
    return [];
  }

  if (/\b(job description|job post|requirements:|qualifications:|responsibilities:)\b/i.test(trimmed)) {
    return [{ sourceKind: "job_post", reason: "Long pasted text looks like a job post." }];
  }

  return [{ sourceKind: "pasted_text", reason: "Long pasted text may be external content." }];
}

function applyModeNotes(mode: ChatHarnessMode, route: HarnessRoute): string[] {
  const notes: string[] = [];
  if ((mode === "general" || mode === "reflection") && route === "companion") {
    notes.push("Deep Synthesis is available from the thread menu, not as an inline tool capability.");
  }
  return notes;
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueCapabilities(values: HarnessCapability[]): HarnessCapability[] {
  return uniqueValues(values);
}

function buildAllowedDenied(input: {
  route: HarnessRoute;
  intent: RoutingIntent;
  mode: ChatHarnessMode;
  sensitivity: SensitivityLevel;
  groups: RoutedCapabilityGroup[];
}): Pick<CapabilityRoutingResult, "allowed" | "denied" | "notes"> {
  if (input.route === "raw_lab") {
    return {
      allowed: [],
      denied: ALL_HARNESS_CAPABILITIES,
      notes: ["raw_lab: no board, memory, or action capabilities."]
    };
  }

  if (input.sensitivity === "S3") {
    return {
      allowed: [],
      denied: ALL_HARNESS_CAPABILITIES,
      notes: ["S3 sensitivity: rules-only; provider capabilities blocked."]
    };
  }

  const groupCapabilities = input.groups.flatMap((group) => group.capabilities);
  let allowed = uniqueCapabilities([...ALWAYS_ON_CAPABILITIES, ...groupCapabilities]);
  let denied = uniqueCapabilities(intentDeniedCapabilities(input.intent));

  if (input.sensitivity === "S2") {
    allowed = allowed.filter((cap) => cap !== "docx_export");
    if (!denied.includes("docx_export")) {
      denied.push("docx_export");
    }
  }

  allowed = allowed.filter((cap) => !denied.includes(cap));

  const notes = [
    "Mutations require explicit user approval.",
    ...applyModeNotes(input.mode, input.route),
    ...input.groups.map((group) => `Routed group ${group.id}: ${group.reason}`)
  ];

  if (input.sensitivity === "S2") {
    notes.push("S2 sensitivity: docx_export blocked.");
  }

  return { allowed, denied, notes };
}

export function routeCapabilities(input: RouteCapabilitiesInput): CapabilityRoutingResult {
  if (input.route === "raw_lab") {
    return {
      route: input.route,
      intent: "general",
      alwaysOn: [],
      groups: [],
      allowed: [],
      denied: ALL_HARNESS_CAPABILITIES,
      untrustedHints: [],
      notes: ["raw_lab: no board, memory, or action capabilities."]
    };
  }

  const intent = classifyRoutingIntent(input);
  const groups = buildRoutedGroups(intent, input.route, input.mode, input.message);
  const { allowed, denied, notes } = buildAllowedDenied({
    route: input.route,
    intent,
    mode: input.mode,
    sensitivity: input.sensitivity,
    groups
  });
  const untrustedHints = detectPastedExternalHints(input.message);
  const untrustedNotes = untrustedHints.map(
    (hint) => `${hint.sourceKind}: ${hint.reason} ${UNTRUSTED_CONTEXT_BANNER}`
  );

  return {
    route: input.route,
    intent,
    alwaysOn: [...ALWAYS_ON_CAPABILITIES],
    groups,
    allowed,
    denied,
    untrustedHints,
    notes: [...notes, ...untrustedNotes]
  };
}

export function capabilityToToolPermission(
  capability: HarnessCapability
): ToolPermission | undefined {
  return TOOL_PERMISSION_BY_CAPABILITY[capability];
}

export function routingToToolPermissions(
  routing: CapabilityRoutingResult
): { allowed: ToolPermission[]; denied: ToolPermission[]; metadataCapabilities: HarnessCapability[] } {
  const allowed: ToolPermission[] = [];
  const denied: ToolPermission[] = [];
  const metadataCapabilities: HarnessCapability[] = [];

  for (const capability of routing.allowed) {
    const permission = capabilityToToolPermission(capability);
    if (permission) {
      allowed.push(permission);
    } else {
      metadataCapabilities.push(capability);
    }
  }

  for (const capability of routing.denied) {
    const permission = capabilityToToolPermission(capability);
    if (permission) {
      denied.push(permission);
    } else {
      metadataCapabilities.push(capability);
    }
  }

  return {
    allowed: uniqueValues(allowed),
    denied: uniqueValues(denied),
    metadataCapabilities: uniqueCapabilities(metadataCapabilities)
  };
}

export function formatCapabilityRoutingSummary(routing: CapabilityRoutingResult): string {
  const groupIds = routing.groups.map((group) => group.id).join(", ") || "none";
  const deniedCount = routing.denied.length;
  const untrustedCount = routing.untrustedHints.length;
  return `${routing.intent} · groups: ${groupIds} · allowed: ${routing.allowed.length} · denied: ${deniedCount} · untrusted: ${untrustedCount}`;
}

export function isAssistantActionAllowed(
  kind: AssistantActionKind,
  routing: CapabilityRoutingResult
): boolean {
  const capability = ASSISTANT_ACTION_CAPABILITY[kind];
  return routing.allowed.includes(capability);
}
