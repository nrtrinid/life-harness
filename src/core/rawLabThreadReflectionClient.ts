import type { CompanionSelfMemory, CompanionSelfMemoryForWire } from "./companionSelfMemory";
import { toCompanionSelfMemoryWireList } from "./companionSelfMemory";
import { RawLabError, rawLabFetchFailureMessage } from "./rawLabClient";
import {
  addDoNotRepeat,
  addProvisionalStance,
  addQuestionToRevisit,
  addSelfObservation,
  addUserSteering,
  createEmptyRawLabThreadState,
  setCurrentVibe,
  toWireThreadState,
  toWireTurns,
  type RawLabThreadState,
  type RawLabTurn
} from "./rawLabThreadState";

export type RawLabThreadReflectionProposal = {
  self_observations: string[];
  questions_to_revisit: string[];
  provisional_stances: string[];
  current_vibe: string;
  do_not_repeat: string[];
  user_steering: string[];
};

export type RawLabThreadReflectionResponse = {
  proposals: RawLabThreadReflectionProposal;
  safety_notes: string[];
  used_context: false;
};

export interface ReflectRawLabThreadInput {
  baseUrl: string;
  turns?: RawLabTurn[];
  threadState?: RawLabThreadState;
  companionSelfMemories?: CompanionSelfMemory[];
  signal?: AbortSignal;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function emptyProposal(): RawLabThreadReflectionProposal {
  return {
    self_observations: [],
    questions_to_revisit: [],
    provisional_stances: [],
    current_vibe: "",
    do_not_repeat: [],
    user_steering: []
  };
}

export function parseRawLabThreadReflectionResponse(
  payload: unknown
): RawLabThreadReflectionResponse {
  if (!payload || typeof payload !== "object") {
    throw new RawLabError("Unexpected thread reflection response from ai-gateway.");
  }
  const data = payload as Record<string, unknown>;
  if (data.used_context !== false) {
    throw new RawLabError("Unexpected thread reflection response from ai-gateway.");
  }
  if (!Array.isArray(data.safety_notes) || !data.proposals || typeof data.proposals !== "object") {
    throw new RawLabError("Unexpected thread reflection response from ai-gateway.");
  }

  const raw = data.proposals as Record<string, unknown>;
  return {
    proposals: {
      self_observations: stringList(raw.self_observations),
      questions_to_revisit: stringList(raw.questions_to_revisit),
      provisional_stances: stringList(raw.provisional_stances),
      current_vibe: typeof raw.current_vibe === "string" ? raw.current_vibe : "",
      do_not_repeat: stringList(raw.do_not_repeat),
      user_steering: stringList(raw.user_steering)
    },
    safety_notes: data.safety_notes.filter((note): note is string => typeof note === "string"),
    used_context: false
  };
}

export function buildRawLabThreadReflectionRequestBody(input: {
  turns?: RawLabTurn[];
  threadState?: RawLabThreadState;
  companionSelfMemories?: CompanionSelfMemory[];
}): {
  recent_turns: ReturnType<typeof toWireTurns>;
  thread_state: ReturnType<typeof toWireThreadState>;
  companion_self_memories: CompanionSelfMemoryForWire[];
} {
  return {
    recent_turns: toWireTurns(input.turns ?? []),
    thread_state: toWireThreadState(input.threadState ?? createEmptyRawLabThreadState()),
    companion_self_memories: toCompanionSelfMemoryWireList(input.companionSelfMemories ?? [])
  };
}

export function applyRawLabThreadReflection(
  state: RawLabThreadState,
  response: RawLabThreadReflectionResponse
): RawLabThreadState {
  let next = state;
  for (const observation of response.proposals.self_observations) {
    next = addSelfObservation(next, observation);
  }
  for (const question of response.proposals.questions_to_revisit) {
    next = addQuestionToRevisit(next, question);
  }
  for (const stance of response.proposals.provisional_stances) {
    next = addProvisionalStance(next, stance);
  }
  for (const phrase of response.proposals.do_not_repeat) {
    next = addDoNotRepeat(next, phrase);
  }
  for (const steering of response.proposals.user_steering) {
    next = addUserSteering(next, steering);
  }
  if (response.proposals.current_vibe.trim()) {
    next = setCurrentVibe(next, response.proposals.current_vibe);
  }
  return next;
}

export function hasRawLabThreadReflectionProposal(
  response: RawLabThreadReflectionResponse | null
): boolean {
  if (!response) {
    return false;
  }
  const proposals = response.proposals;
  return (
    proposals.self_observations.length > 0 ||
    proposals.questions_to_revisit.length > 0 ||
    proposals.provisional_stances.length > 0 ||
    Boolean(proposals.current_vibe.trim()) ||
    proposals.do_not_repeat.length > 0 ||
    proposals.user_steering.length > 0
  );
}

export async function reflectRawLabThread(
  input: ReflectRawLabThreadInput
): Promise<RawLabThreadReflectionResponse> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const body = buildRawLabThreadReflectionRequestBody({
    turns: input.turns,
    threadState: input.threadState,
    companionSelfMemories: input.companionSelfMemories
  });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/raw-lab/reflect-thread`, {
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
    throw new RawLabError(detail ?? `Raw Lab thread reflection failed (${response.status}).`, response.status);
  }

  try {
    return parseRawLabThreadReflectionResponse(JSON.parse(text));
  } catch (error) {
    if (error instanceof RawLabError) {
      throw error;
    }
    return {
      proposals: emptyProposal(),
      safety_notes: ["Thread reflection returned unusable JSON; no changes proposed."],
      used_context: false
    };
  }
}
