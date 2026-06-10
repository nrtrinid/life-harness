import type { CompanionSelfMemory, CompanionSelfMemoryForWire } from "./companionSelfMemory";
import { toCompanionSelfMemoryWireList } from "./companionSelfMemory";
import {
  createEmptyRawLabThreadState,
  toWireThreadState,
  toWireTurns,
  type RawLabThreadState,
  type RawLabTurn
} from "./rawLabThreadState";
import { RawLabError, rawLabFetchFailureMessage } from "./rawLabClient";

export type RawLabSelfMemoryProposal = {
  kind: string;
  subject: "companion_self" | "interaction_pattern" | "user_preference";
  text: string;
  confidence: number;
  sensitivity: "S0" | "S1" | "S2";
  reason: string;
};

export type RawLabSelfReflectionResponse = {
  proposals: RawLabSelfMemoryProposal[];
  safety_notes: string[];
  used_context: false;
};

export interface ReflectOnRawLabInput {
  baseUrl: string;
  turns?: RawLabTurn[];
  threadState?: RawLabThreadState;
  existingSelfMemories?: CompanionSelfMemory[];
  signal?: AbortSignal;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

export function parseRawLabSelfReflectionResponse(
  payload: unknown
): RawLabSelfReflectionResponse {
  if (!payload || typeof payload !== "object") {
    throw new RawLabError("Unexpected self-reflection response from ai-gateway.");
  }
  const data = payload as Record<string, unknown>;
  if (!Array.isArray(data.proposals) || !Array.isArray(data.safety_notes)) {
    throw new RawLabError("Unexpected self-reflection response from ai-gateway.");
  }
  if (data.used_context !== false) {
    throw new RawLabError("Unexpected self-reflection response from ai-gateway.");
  }

  const proposals = data.proposals
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      kind: String(item.kind ?? "self_observation"),
      subject: (item.subject ?? "companion_self") as RawLabSelfMemoryProposal["subject"],
      text: String(item.text ?? ""),
      confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
      sensitivity: (item.sensitivity ?? "S0") as RawLabSelfMemoryProposal["sensitivity"],
      reason: typeof item.reason === "string" ? item.reason : ""
    }))
    .filter((proposal) => proposal.text.trim().length > 0);

  return {
    proposals,
    safety_notes: data.safety_notes.filter((note): note is string => typeof note === "string"),
    used_context: false
  };
}

export async function reflectOnRawLab(
  input: ReflectOnRawLabInput
): Promise<RawLabSelfReflectionResponse> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const existing: CompanionSelfMemoryForWire[] = toCompanionSelfMemoryWireList(
    input.existingSelfMemories ?? []
  );
  const body = {
    recent_turns: toWireTurns(input.turns ?? []),
    thread_state: toWireThreadState(input.threadState ?? createEmptyRawLabThreadState()),
    existing_self_memories: existing
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/raw-lab/self-reflection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: input.signal
    });
  } catch (error) {
    throw new RawLabError(rawLabFetchFailureMessage(baseUrl, error));
  }

  const text = await response.text();
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      detail = parsed.detail;
    } catch {
      detail = undefined;
    }
    throw new RawLabError(
      detail ?? `Raw Lab self-reflection failed (${response.status}).`,
      response.status
    );
  }

  try {
    return parseRawLabSelfReflectionResponse(JSON.parse(text));
  } catch (error) {
    if (error instanceof RawLabError) {
      throw error;
    }
    throw new RawLabError("Unexpected self-reflection response from ai-gateway.");
  }
}
