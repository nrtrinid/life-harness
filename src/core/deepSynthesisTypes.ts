import type { WireChatHarnessThreadState } from "./chatThreadState";
import type { WireContextPacket } from "./contextPacketWire";
import type { ConversationTurn, HarnessContext } from "./harnessContext";
import type { HarnessMemoryKind, SensitivityLevel } from "./types";

export type DeepSynthesisTrigger =
  | "user_prompt"
  | "selected_ramble"
  | "thread_excerpt"
  | "project_question";

export type SynthesisLens = "practical" | "emotional" | "product" | "skeptical";

export type SynthesisPipelineProfile =
  | "auto"
  | "fast_only"
  | "with_critic"
  | "with_stretch";

export type SynthesisGroundingKind =
  | "active_card"
  | "proof_log"
  | "memory"
  | "thread_excerpt"
  | "project_doc"
  | "inferred_from_prompt";

export type AiJobKind = "deep_synthesis";

export type AiJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface SynthesisGroundingRef {
  kind: SynthesisGroundingKind;
  ref: string;
  label: string;
}

export interface SynthesisInterpretation {
  lens: SynthesisLens;
  summary: string;
  confidence: "low" | "medium" | "high";
  grounding: SynthesisGroundingRef[];
}

export interface SynthesisCritique {
  shallowFlags: string[];
  missing: string[];
  avoidance: string[];
  contradictions: string[];
  overall: "pass" | "revise";
  revisionBrief?: string;
}

export interface SynthesisNextPounce {
  title: string;
  smallestAction: string;
  cardHint?: string;
  grounding: SynthesisGroundingRef;
}

export interface SynthesisMemoryProposal {
  kind: HarnessMemoryKind;
  text: string;
  requiresApproval: true;
  sourceSynthesisId: string;
}

export type SynthesisPersonalityField =
  | "voice_traits"
  | "stance"
  | "growth_notes"
  | "conversational_instincts";

export interface SynthesisPersonalityProposal {
  field: SynthesisPersonalityField;
  proposed: string;
  requiresApproval: true;
  rationale: string;
}

export interface DeepSynthesisResultBody {
  synthesisId: string;
  pipelineProfileUsed: SynthesisPipelineProfile;
  degradedNotes: string[];
  phasesCompleted: string[];
  circling: string;
  strongestIdea: string;
  hiddenRisk: string;
  connections: string[];
  circlingGrounding: SynthesisGroundingRef[];
  strongestIdeaGrounding: SynthesisGroundingRef[];
  hiddenRiskGrounding: SynthesisGroundingRef[];
  nextPounce: SynthesisNextPounce;
  interpretations: SynthesisInterpretation[];
  critique?: SynthesisCritique;
  memoryProposals: SynthesisMemoryProposal[];
  personalityProposals: SynthesisPersonalityProposal[];
  confidenceNotes: string[];
  safetyNotes: string[];
}

export interface DeepSynthesisCompletedResult extends DeepSynthesisResultBody {
  status: "completed";
}

export interface DeepSynthesisSyncQueued {
  status: "queued";
  jobId: string;
  pollUrl: string;
  redirectReason: string;
}

export interface DeepSynthesisJobEnqueue {
  status: "queued";
  jobId: string;
  pollUrl: string;
  jobKind: AiJobKind;
  phase: string;
  createdAt: string;
}

export type DeepSynthesisPostResponse = DeepSynthesisCompletedResult | DeepSynthesisSyncQueued;

export interface AiJobStatusResponse {
  jobId: string;
  jobKind: string;
  status: AiJobStatus;
  phase?: string;
  createdAt: string;
  completedAt?: string;
  result?: DeepSynthesisResultBody;
  error?: string;
}

export interface DeepSynthesisRequestInput {
  trigger: DeepSynthesisTrigger;
  sensitivity: SensitivityLevel;
  userPrompt: string;
  context: HarnessContext;
  contextPacket?: WireContextPacket;
  conversationHistory?: ConversationTurn[];
  threadState?: WireChatHarnessThreadState;
  interpretationLenses?: SynthesisLens[];
  pipelineProfile?: SynthesisPipelineProfile;
  preferAsyncIfSlow?: boolean;
}

export class DeepSynthesisParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSynthesisParseError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new DeepSynthesisParseError(`Missing or invalid ${key}.`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function parseGroundingRef(value: unknown): SynthesisGroundingRef {
  const record = asRecord(value);
  if (!record) {
    throw new DeepSynthesisParseError("Invalid grounding ref.");
  }
  const kind = requireString(record, "kind") as SynthesisGroundingKind;
  return {
    kind,
    ref: requireString(record, "ref"),
    label: requireString(record, "label")
  };
}

function parseGroundingArray(value: unknown, fieldName: string): SynthesisGroundingRef[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DeepSynthesisParseError(`Missing or invalid ${fieldName}.`);
  }
  return value.map(parseGroundingRef);
}

function parseInterpretation(value: unknown): SynthesisInterpretation {
  const record = asRecord(value);
  if (!record) {
    throw new DeepSynthesisParseError("Invalid interpretation.");
  }
  const confidence = requireString(record, "confidence");
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") {
    throw new DeepSynthesisParseError("Invalid interpretation confidence.");
  }
  return {
    lens: requireString(record, "lens") as SynthesisLens,
    summary: requireString(record, "summary"),
    confidence,
    grounding: parseGroundingArray(record.grounding, "interpretation.grounding")
  };
}

function parseCritique(value: unknown): SynthesisCritique | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const overall = requireString(record, "overall");
  if (overall !== "pass" && overall !== "revise") {
    throw new DeepSynthesisParseError("Invalid critique overall.");
  }
  return {
    shallowFlags: stringArray(record.shallow_flags),
    missing: stringArray(record.missing),
    avoidance: stringArray(record.avoidance),
    contradictions: stringArray(record.contradictions),
    overall,
    revisionBrief: optionalString(record, "revision_brief")
  };
}

function parseNextPounce(value: unknown): SynthesisNextPounce {
  const record = asRecord(value);
  if (!record) {
    throw new DeepSynthesisParseError("Missing next_pounce.");
  }
  return {
    title: requireString(record, "title"),
    smallestAction: requireString(record, "smallest_action"),
    cardHint: optionalString(record, "card_hint"),
    grounding: parseGroundingRef(record.grounding)
  };
}

function parseMemoryProposal(value: unknown): SynthesisMemoryProposal {
  const record = asRecord(value);
  if (!record) {
    throw new DeepSynthesisParseError("Invalid memory proposal.");
  }
  if (record.requires_approval !== true) {
    throw new DeepSynthesisParseError("memory_proposals must require approval.");
  }
  return {
    kind: requireString(record, "kind") as HarnessMemoryKind,
    text: requireString(record, "text"),
    requiresApproval: true,
    sourceSynthesisId: requireString(record, "source_synthesis_id")
  };
}

function parsePersonalityProposal(value: unknown): SynthesisPersonalityProposal {
  const record = asRecord(value);
  if (!record) {
    throw new DeepSynthesisParseError("Invalid personality proposal.");
  }
  if (record.requires_approval !== true) {
    throw new DeepSynthesisParseError("personality_proposals must require approval.");
  }
  return {
    field: requireString(record, "field") as SynthesisPersonalityField,
    proposed: requireString(record, "proposed"),
    requiresApproval: true,
    rationale: requireString(record, "rationale")
  };
}

export function parseDeepSynthesisResultBody(data: unknown): DeepSynthesisResultBody {
  const record = asRecord(data);
  if (!record) {
    throw new DeepSynthesisParseError("Invalid synthesis result body.");
  }

  return {
    synthesisId: requireString(record, "synthesis_id"),
    pipelineProfileUsed: requireString(record, "pipeline_profile_used") as SynthesisPipelineProfile,
    degradedNotes: stringArray(record.degraded_notes),
    phasesCompleted: stringArray(record.phases_completed),
    circling: requireString(record, "circling"),
    strongestIdea: requireString(record, "strongest_idea"),
    hiddenRisk: requireString(record, "hidden_risk"),
    connections: stringArray(record.connections),
    circlingGrounding: parseGroundingArray(record.circling_grounding, "circling_grounding"),
    strongestIdeaGrounding: parseGroundingArray(
      record.strongest_idea_grounding,
      "strongest_idea_grounding"
    ),
    hiddenRiskGrounding: parseGroundingArray(record.hidden_risk_grounding, "hidden_risk_grounding"),
    nextPounce: parseNextPounce(record.next_pounce),
    interpretations: Array.isArray(record.interpretations)
      ? record.interpretations.map(parseInterpretation)
      : [],
    critique: parseCritique(record.critique),
    memoryProposals: Array.isArray(record.memory_proposals)
      ? record.memory_proposals.map(parseMemoryProposal)
      : [],
    personalityProposals: Array.isArray(record.personality_proposals)
      ? record.personality_proposals.map(parsePersonalityProposal)
      : [],
    confidenceNotes: stringArray(record.confidence_notes),
    safetyNotes: stringArray(record.safety_notes)
  };
}

export function parseDeepSynthesisCompletedResult(payload: unknown): DeepSynthesisCompletedResult {
  const record = asRecord(payload);
  if (!record || record.status !== "completed") {
    throw new DeepSynthesisParseError("Expected completed synthesis response.");
  }
  return {
    status: "completed",
    ...parseDeepSynthesisResultBody(record)
  };
}

export function parseDeepSynthesisSyncQueued(payload: unknown): DeepSynthesisSyncQueued {
  const record = asRecord(payload);
  if (!record || record.status !== "queued") {
    throw new DeepSynthesisParseError("Expected queued synthesis response.");
  }
  return {
    status: "queued",
    jobId: requireString(record, "job_id"),
    pollUrl: requireString(record, "poll_url"),
    redirectReason: requireString(record, "redirect_reason")
  };
}

export function parseDeepSynthesisPostResponse(payload: unknown): DeepSynthesisPostResponse {
  const record = asRecord(payload);
  if (!record) {
    throw new DeepSynthesisParseError("Unexpected response from ai-gateway.");
  }
  if (record.status === "queued") {
    return parseDeepSynthesisSyncQueued(record);
  }
  return parseDeepSynthesisCompletedResult(record);
}

export function parseDeepSynthesisJobEnqueue(payload: unknown): DeepSynthesisJobEnqueue {
  const record = asRecord(payload);
  if (!record || record.status !== "queued") {
    throw new DeepSynthesisParseError("Expected job enqueue response.");
  }
  const jobKind = requireString(record, "job_kind");
  if (jobKind !== "deep_synthesis") {
    throw new DeepSynthesisParseError("Unexpected job kind.");
  }
  return {
    status: "queued",
    jobId: requireString(record, "job_id"),
    pollUrl: requireString(record, "poll_url"),
    jobKind: "deep_synthesis",
    phase: requireString(record, "phase"),
    createdAt: requireString(record, "created_at")
  };
}

function parseJobKind(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DeepSynthesisParseError("Invalid job kind.");
  }
  return value;
}

function parseAiJobStatus(value: unknown): AiJobStatus {
  if (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }
  throw new DeepSynthesisParseError("Invalid job status.");
}

export function parseAiJobStatusResponse(payload: unknown): AiJobStatusResponse {
  const record = asRecord(payload);
  if (!record) {
    throw new DeepSynthesisParseError("Invalid job status response.");
  }

  const response: AiJobStatusResponse = {
    jobId: requireString(record, "job_id"),
    jobKind: parseJobKind(record.job_kind),
    status: parseAiJobStatus(record.status),
    phase: optionalString(record, "phase"),
    createdAt: requireString(record, "created_at"),
    completedAt: optionalString(record, "completed_at"),
    error: optionalString(record, "error")
  };

  if (record.result !== undefined && record.result !== null) {
    response.result = parseDeepSynthesisResultBody(record.result);
  }

  return response;
}
