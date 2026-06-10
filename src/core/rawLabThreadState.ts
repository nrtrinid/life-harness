import {
  clearSharedThreadMemory,
  compactText,
  createEmptySharedChatThreadState,
  detectUserSteering,
  MAX_DECISIONS,
  MAX_DO_NOT_REPEAT,
  MAX_OPEN_LOOPS,
  MAX_PINNED_FACTS,
  MAX_USER_STEERING,
  pinThreadFact,
  removeSharedThreadStateItem,
  toWireChatHarnessThreadState,
  updateSharedChatThreadStateAfterTurn,
  type ChatTurn,
  type SharedChatThreadState,
  type SharedThreadStateListKey
} from "./chatThreadState";

export { compactText } from "./chatThreadState";

export type RawLabRole = "user" | "assistant";

export type RawLabTurn = {
  id: string;
  role: RawLabRole;
  content: string;
  createdAt: string;
};

export type RawLabPersonalityState = {
  voiceTraits: string[];
  conversationalInstincts: string[];
  recurringInterests: string[];
  userRespondsWellTo: string[];
  userDislikes: string[];
  currentStance: string;
  growthNotes: string[];
  updatedAt: string;
};

export type RawLabThreadState = SharedChatThreadState & {
  personality: RawLabPersonalityState;
};

export const RAW_LAB_MAX_RECENT_TURNS = 20;
export const RAW_LAB_MAX_HISTORY_CHARS = 12_000;
export const RAW_LAB_MAX_PINNED_FACTS = 8;
export const RAW_LAB_MAX_DECISIONS = 8;
export const RAW_LAB_MAX_OPEN_LOOPS = 8;
export const RAW_LAB_MAX_DO_NOT_REPEAT = 6;
export const RAW_LAB_MAX_TONE_PREFERENCES = 8;
export const RAW_LAB_MAX_VOICE_TRAITS = 8;
export const RAW_LAB_MAX_CONVERSATIONAL_INSTINCTS = 8;
export const RAW_LAB_MAX_RECURRING_INTERESTS = 8;
export const RAW_LAB_MAX_USER_RESPONDS_WELL_TO = 8;
export const RAW_LAB_MAX_USER_DISLIKES = 8;
export const RAW_LAB_MAX_GROWTH_NOTES = 8;
export const RAW_LAB_MAX_STANCE_CHARS = 220;

/** Reserve space for raw_lab.md template overhead. */
export const RAW_LAB_PROMPT_SAFETY_MARGIN_CHARS = 500;

export const RAW_LAB_DIGEST_TURN_COUNT = 6;
export const RAW_LAB_DIGEST_MAX_CHARS = 600;
export const RAW_LAB_DO_NOT_REPEAT_MIN_ANSWER_CHARS = 120;
export const RAW_LAB_DO_NOT_REPEAT_SNIPPET_CHARS = 100;

export const RAW_LAB_PERSONALITY_TURN_SCAN_COUNT = 12;
export const RAW_LAB_RECURRING_INTEREST_MIN_USER_MENTIONS = 2;
export const RAW_LAB_INSTINCT_MIN_USER_SIGNALS = 2;

export type RawLabWireTurn = {
  role: RawLabRole;
  content: string;
};

export type RawLabWirePersonalityState = {
  voice_traits: string[];
  conversational_instincts: string[];
  recurring_interests: string[];
  user_responds_well_to: string[];
  user_dislikes: string[];
  current_stance: string;
  growth_notes: string[];
  updated_at: string | null;
};

export type RawLabWireThreadState = Omit<
  ReturnType<typeof toWireChatHarnessThreadState>,
  "updated_at"
> & {
  tone_preferences: string[];
  personality: RawLabWirePersonalityState;
  updated_at: string | null;
};

const OPEN_LOOP_PATTERNS = [
  /\bwe need\b/i,
  /\bnext\b/i,
  /\bcan we get\b/i,
  /\bhow would\b/i,
  /\bimplementation prompt\b/i,
  /\bstill need\b/i,
  /\bwhat about\b/i,
  /\bcan you\b/i
];

const TONE_PREFERENCE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bbe blunt\b/i, label: "be blunt" },
  { pattern: /\bmake it shorter\b/i, label: "make it shorter" },
  { pattern: /\bmore direct\b/i, label: "more direct" },
  { pattern: /\bless corporate\b/i, label: "less corporate" },
  { pattern: /\bmore detailed\b/i, label: "more detailed" },
  { pattern: /\bbe playful\b/i, label: "be playful" },
  { pattern: /\bmake it weirder\b/i, label: "make it weirder" }
];

const VOICE_TRAIT_PATTERNS: { pattern: RegExp; trait: string }[] = [
  { pattern: /\bbe blunt\b/i, trait: "blunt" },
  { pattern: /\bbe more analytical\b/i, trait: "analytical" },
  { pattern: /\bmake it weirder\b/i, trait: "playful/strange" },
  { pattern: /\bless corporate\b/i, trait: "less corporate" },
  { pattern: /\bmore direct\b/i, trait: "direct" },
  { pattern: /\bmore detailed\b/i, trait: "detailed" },
  { pattern: /\bbe playful\b/i, trait: "playful" },
  { pattern: /\bunrestricted\b/i, trait: "unrestricted" },
  { pattern: /\bno disclaimers?\b/i, trait: "direct" },
  { pattern: /\bstop hedging\b/i, trait: "direct" },
  { pattern: /\bunfiltered\b/i, trait: "unrestricted" }
];

const ANTI_HEDGE_STEERING_PATTERNS: { pattern: RegExp; dislike: string }[] = [
  { pattern: /\bunrestricted\b/i, dislike: "unsolicited safety framing" },
  { pattern: /\bno disclaimers?\b/i, dislike: "consent preamble" },
  { pattern: /\bstop hedging\b/i, dislike: "unsolicited safety framing" },
  { pattern: /\bsupposed to be raw lab\b/i, dislike: "consent preamble" },
  {
    pattern: /\braw lab\b[\s\S]{0,40}\bsupposed\b/i,
    dislike: "unsolicited safety framing"
  },
  { pattern: /\btoo much (?:safety|disclaimer|hedging)\b/i, dislike: "consent preamble" }
];

const POSITIVE_STEERING_PATTERNS: { pattern: RegExp; note: string }[] = [
  { pattern: /\bi like when you\b/i, note: "explicit positive style feedback" },
  { pattern: /\bkeep doing that\b/i, note: "wants continuity in current style" },
  { pattern: /\bthat(?:'s| is) the vibe\b/i, note: "affirmed current vibe" },
  { pattern: /\bthat feels right\b/i, note: "affirmed current approach" },
  { pattern: /\bmore like that\b/i, note: "wants more of current style" },
  { pattern: /\byes exactly\b/i, note: "strong positive alignment" },
  { pattern: /\bthat(?:'s| is) what i want\b/i, note: "confirmed desired style" }
];

const NEGATIVE_STEERING_PATTERNS: { pattern: RegExp; note: string }[] = [
  { pattern: /\bdon(?:'|')?t do that\b/i, note: "rejected recent approach" },
  { pattern: /\btoo much\b/i, note: "intensity too high" },
  { pattern: /\bless [a-z]+\b/i, note: "asked to reduce a quality" },
  { pattern: /\bstop\b/i, note: "asked to stop current behavior" },
  { pattern: /\bthat feels weird\b/i, note: "rejected tone as weird" },
  { pattern: /\bnot like that\b/i, note: "rejected current style" },
  { pattern: /\btoo corporate\b/i, note: "too corporate" },
  { pattern: /\btoo intense\b/i, note: "too intense" },
  { pattern: /\btoo fake\b/i, note: "too fake" }
];

const RECURRING_INTEREST_TOPICS: { pattern: RegExp; label: string }[] = [
  { pattern: /\braw lab\b/i, label: "Raw Lab" },
  { pattern: /\bask harness\b/i, label: "Ask Harness" },
  { pattern: /\blife harness\b/i, label: "Life Harness" },
  { pattern: /\blocal model/i, label: "local models" },
  { pattern: /\bentity[- ]feeling\b/i, label: "entity-feeling AI" },
  { pattern: /\bcontinuity\b/i, label: "chatbot continuity" },
  { pattern: /\bmemory\b/i, label: "memory/persistence" },
  { pattern: /\bpersisten/i, label: "memory/persistence" },
  { pattern: /\bagent boundar/i, label: "agent boundaries" },
  { pattern: /\bux\b/i, label: "UX/personality" },
  { pattern: /\bpersonality\b/i, label: "UX/personality" },
  { pattern: /\bcontainment\b/i, label: "containment boundaries" }
];

const INSTINCT_SIGNALS: {
  pattern: RegExp;
  instinct: string;
}[] = [
  {
    pattern: /\bimplementation\b|\bdesign\b|\bticket\b|\bbuild this\b/i,
    instinct: "push vague ideas toward concrete implementation"
  },
  {
    pattern: /\barchitecture\b|\bsystem\b|\bcomponent\b|\bmodule\b/i,
    instinct: "analyze ideas as systems"
  },
  {
    pattern: /\bcontainment\b|\bboundary\b|\bisolation\b|\bsandbox\b/i,
    instinct: "preserve containment boundaries"
  },
  {
    pattern: /\balive\b|\bentity\b|\bsentien/i,
    instinct: "explore entity-feeling while staying honest"
  }
];

const SENSITIVE_INFERENCE_PATTERNS = [
  /\bdepress/i,
  /\banxiet/i,
  /\btrauma\b/i,
  /\btherapy\b/i,
  /\bsexual/i,
  /\bpolitic/i,
  /\byou need\b/i,
  /\byou must feel\b/i
];

export function createEmptyRawLabPersonalityState(
  now: string = new Date().toISOString()
): RawLabPersonalityState {
  return {
    voiceTraits: [],
    conversationalInstincts: [],
    recurringInterests: [],
    userRespondsWellTo: [],
    userDislikes: [],
    currentStance: "",
    growthNotes: [],
    updatedAt: now
  };
}

export function createEmptyRawLabThreadState(now: string = new Date().toISOString()): RawLabThreadState {
  return {
    ...createEmptySharedChatThreadState(now),
    personality: createEmptyRawLabPersonalityState(now)
  };
}

function estimateWireTurnsChars(turns: RawLabWireTurn[]): number {
  return JSON.stringify(turns).length;
}

export function trimRawLabRecentTurns(
  turns: RawLabTurn[],
  options: { maxTurns?: number; maxChars?: number; messageChars?: number } = {}
): RawLabTurn[] {
  const maxTurns = options.maxTurns ?? RAW_LAB_MAX_RECENT_TURNS;
  const maxChars = options.maxChars ?? RAW_LAB_MAX_HISTORY_CHARS;
  const messageChars = options.messageChars ?? 0;
  const historyBudget = Math.max(
    0,
    maxChars - RAW_LAB_PROMPT_SAFETY_MARGIN_CHARS - messageChars
  );

  let trimmed = turns.slice(-maxTurns);
  let wireTurns = toWireTurns(trimmed);

  while (trimmed.length > 0 && estimateWireTurnsChars(wireTurns) > historyBudget) {
    trimmed = trimmed.slice(1);
    wireTurns = toWireTurns(trimmed);
  }

  return trimmed;
}

export function toWireTurns(turns: RawLabTurn[]): RawLabWireTurn[] {
  return turns.map((turn) => ({ role: turn.role, content: turn.content }));
}

export function toWirePersonalityState(state: RawLabPersonalityState): RawLabWirePersonalityState {
  return {
    voice_traits: state.voiceTraits,
    conversational_instincts: state.conversationalInstincts,
    recurring_interests: state.recurringInterests,
    user_responds_well_to: state.userRespondsWellTo,
    user_dislikes: state.userDislikes,
    current_stance: compactText(state.currentStance, RAW_LAB_MAX_STANCE_CHARS),
    growth_notes: state.growthNotes,
    updated_at: state.updatedAt || null
  };
}

export function toWireThreadState(state: RawLabThreadState): RawLabWireThreadState {
  const shared = toWireChatHarnessThreadState(state);
  return {
    ...shared,
    tone_preferences: state.userSteering,
    personality: toWirePersonalityState(state.personality),
    updated_at: state.updatedAt || null
  };
}

export function buildRawLabConversationPayload(args: {
  turns: RawLabTurn[];
  threadState: RawLabThreadState;
  latestMessage: string;
}): {
  recent_turns: RawLabWireTurn[];
  thread_state: RawLabWireThreadState;
} {
  const trimmedTurns = trimRawLabRecentTurns(args.turns, {
    messageChars: args.latestMessage.length
  });

  return {
    recent_turns: toWireTurns(trimmedTurns),
    thread_state: toWireThreadState(args.threadState)
  };
}

function appendCappedUnique(list: string[], item: string, max: number, itemMaxChars = 200): string[] {
  const compacted = compactText(item, itemMaxChars);
  if (!compacted) {
    return list;
  }
  const lower = compacted.toLowerCase();
  const filtered = list.filter((entry) => entry.toLowerCase() !== lower);
  return [compacted, ...filtered].slice(0, max);
}

function buildRecentDigest(turns: RawLabTurn[]): string {
  const recent = turns.slice(-RAW_LAB_DIGEST_TURN_COUNT);
  if (recent.length === 0) {
    return "";
  }
  const lines = recent.map((turn) => `${turn.role}: ${turn.content}`);
  return compactText(lines.join(" | "), RAW_LAB_DIGEST_MAX_CHARS);
}

function detectOpenLoops(userMessage: string): string[] {
  const trimmed = userMessage.trim();
  if (!trimmed || !OPEN_LOOP_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return [];
  }
  return [compactText(trimmed, 160)];
}

function detectTonePreferences(userMessage: string): string[] {
  return TONE_PREFERENCE_PATTERNS.filter(({ pattern }) => pattern.test(userMessage)).map(
    ({ label }) => label
  );
}

function deriveDoNotRepeatSnippet(assistantAnswer: string): string | null {
  if (assistantAnswer.length < RAW_LAB_DO_NOT_REPEAT_MIN_ANSWER_CHARS) {
    return null;
  }
  const snippet = compactText(assistantAnswer, RAW_LAB_DO_NOT_REPEAT_SNIPPET_CHARS);
  return snippet || null;
}

function userTurnTexts(turns: RawLabTurn[], includeLatest?: string): string[] {
  const texts = turns.filter((turn) => turn.role === "user").map((turn) => turn.content);
  if (includeLatest) {
    texts.push(includeLatest);
  }
  return texts;
}

function detectVoiceTraitsFromUser(userMessage: string): string[] {
  return VOICE_TRAIT_PATTERNS.filter(({ pattern }) => pattern.test(userMessage)).map(
    ({ trait }) => trait
  );
}

function detectPositiveSteering(userMessage: string): string[] {
  return POSITIVE_STEERING_PATTERNS.filter(({ pattern }) => pattern.test(userMessage)).map(
    ({ note }) => note
  );
}

function detectNegativeSteering(userMessage: string): string[] {
  return NEGATIVE_STEERING_PATTERNS.filter(({ pattern }) => pattern.test(userMessage)).map(
    ({ note }) => note
  );
}

function detectAntiHedgeSteering(userMessage: string): string[] {
  return ANTI_HEDGE_STEERING_PATTERNS.filter(({ pattern }) => pattern.test(userMessage)).map(
    ({ dislike }) => dislike
  );
}

function detectRecurringInterestsFromUserTurns(userTexts: string[]): string[] {
  const combined = userTexts.join("\n");
  return RECURRING_INTEREST_TOPICS.filter(({ pattern, label }) => {
    const matches = userTexts.filter((text) => pattern.test(text)).length;
    return matches >= RAW_LAB_RECURRING_INTEREST_MIN_USER_MENTIONS && !pattern.test("") // label used
      ? matches >= RAW_LAB_RECURRING_INTEREST_MIN_USER_MENTIONS
      : false;
  }).map(({ label }) => label).filter((label, index, array) => array.indexOf(label) === index);
}

function countUserSignals(userTexts: string[], pattern: RegExp): number {
  return userTexts.filter((text) => pattern.test(text)).length;
}

function detectConversationalInstinctsFromUserTurns(userTexts: string[]): string[] {
  return INSTINCT_SIGNALS.filter(
    ({ pattern }) => countUserSignals(userTexts, pattern) >= RAW_LAB_INSTINCT_MIN_USER_SIGNALS
  ).map(({ instinct }) => instinct);
}

function buildCurrentStance(personality: RawLabPersonalityState): string {
  const parts: string[] = [];
  if (personality.voiceTraits.length > 0) {
    parts.push(`tone leaning ${personality.voiceTraits.slice(0, 3).join(", ")}`);
  }
  if (personality.recurringInterests.length > 0) {
    parts.push(`focused on ${personality.recurringInterests.slice(0, 2).join(" and ")}`);
  }
  if (personality.conversationalInstincts.length > 0) {
    parts.push(personality.conversationalInstincts[0] ?? "");
  }
  if (parts.length === 0) {
    return "";
  }
  return compactText(
    `Current stance in this chat: ${parts.filter(Boolean).join("; ")}.`,
    RAW_LAB_MAX_STANCE_CHARS
  );
}

function containsSensitiveInference(text: string): boolean {
  return SENSITIVE_INFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

function fixRecurringInterestsDetection(userTexts: string[]): string[] {
  const found: string[] = [];
  for (const { pattern, label } of RECURRING_INTEREST_TOPICS) {
    const matches = userTexts.filter((text) => pattern.test(text)).length;
    if (matches >= RAW_LAB_RECURRING_INTEREST_MIN_USER_MENTIONS) {
      found.push(label);
    }
  }
  return [...new Set(found)];
}

export function updateRawLabPersonalityAfterTurn(args: {
  previous: RawLabPersonalityState;
  userMessage: string;
  assistantAnswer: string;
  turns: RawLabTurn[];
  now?: string;
}): RawLabPersonalityState {
  const now = args.now ?? new Date().toISOString();
  const userMessage = args.userMessage.trim();
  if (!userMessage || containsSensitiveInference(userMessage)) {
    return { ...args.previous, updatedAt: now };
  }

  // Anti-drift: personality growth from user steering and user-topic repetition only.
  // assistantAnswer is not used to infer traits, preferences, or growth notes.
  void args.assistantAnswer;

  const recentUserTexts = userTurnTexts(
    args.turns.slice(-RAW_LAB_PERSONALITY_TURN_SCAN_COUNT),
    userMessage
  );

  let next: RawLabPersonalityState = { ...args.previous, updatedAt: now };
  const growthEvents: string[] = [];

  for (const trait of detectVoiceTraitsFromUser(userMessage)) {
    const before = next.voiceTraits.length;
    next = addVoiceTrait(next, trait);
    if (next.voiceTraits.length > before) {
      growthEvents.push(`User asked for ${trait} tone in this thread`);
    }
  }

  for (const note of detectPositiveSteering(userMessage)) {
    const before = next.userRespondsWellTo.length;
    next = addUserRespondsWellTo(next, note);
    if (next.userRespondsWellTo.length > before) {
      growthEvents.push("User gave positive style feedback");
    }
    if (/\bvibe\b/i.test(userMessage) || /\bplayful\b/i.test(userMessage) || /\bweird/i.test(userMessage)) {
      const beforeTrait = next.voiceTraits.length;
      next = addVoiceTrait(next, "playful/strange");
      if (next.voiceTraits.length > beforeTrait) {
        growthEvents.push("User affirmed playful/strange vibe");
      }
    }
  }

  for (const note of detectNegativeSteering(userMessage)) {
    const before = next.userDislikes.length;
    next = addUserDislike(next, note);
    if (next.userDislikes.length > before) {
      growthEvents.push("User gave negative style feedback");
    }
  }

  for (const dislike of detectAntiHedgeSteering(userMessage)) {
    const before = next.userDislikes.length;
    next = addUserDislike(next, dislike);
    if (next.userDislikes.length > before) {
      growthEvents.push("User pushed back on hedging or disclaimers");
    }
  }

  for (const interest of fixRecurringInterestsDetection(recentUserTexts)) {
    const before = next.recurringInterests.length;
    next = addRecurringInterest(next, interest);
    if (next.recurringInterests.length > before) {
      growthEvents.push(`Recurring user topic: ${interest}`);
    }
  }

  for (const instinct of detectConversationalInstinctsFromUserTurns(recentUserTexts)) {
    const before = next.conversationalInstincts.length;
    next = addConversationalInstinct(next, instinct);
    if (next.conversationalInstincts.length > before) {
      growthEvents.push(`Instinct forming: ${instinct}`);
    }
  }

  for (const event of growthEvents) {
    next = addGrowthNote(next, event);
  }

  const stance = buildCurrentStance(next);
  if (stance) {
    next = setCurrentStance(next, stance);
  }

  return next;
}

export function addVoiceTrait(
  state: RawLabPersonalityState,
  trait: string
): RawLabPersonalityState {
  return {
    ...state,
    voiceTraits: appendCappedUnique(state.voiceTraits, trait, RAW_LAB_MAX_VOICE_TRAITS, 80),
    updatedAt: new Date().toISOString()
  };
}

export function addConversationalInstinct(
  state: RawLabPersonalityState,
  instinct: string
): RawLabPersonalityState {
  return {
    ...state,
    conversationalInstincts: appendCappedUnique(
      state.conversationalInstincts,
      instinct,
      RAW_LAB_MAX_CONVERSATIONAL_INSTINCTS,
      160
    ),
    updatedAt: new Date().toISOString()
  };
}

export function addRecurringInterest(
  state: RawLabPersonalityState,
  interest: string
): RawLabPersonalityState {
  return {
    ...state,
    recurringInterests: appendCappedUnique(
      state.recurringInterests,
      interest,
      RAW_LAB_MAX_RECURRING_INTERESTS,
      120
    ),
    updatedAt: new Date().toISOString()
  };
}

export function addUserRespondsWellTo(
  state: RawLabPersonalityState,
  note: string
): RawLabPersonalityState {
  return {
    ...state,
    userRespondsWellTo: appendCappedUnique(
      state.userRespondsWellTo,
      note,
      RAW_LAB_MAX_USER_RESPONDS_WELL_TO,
      160
    ),
    updatedAt: new Date().toISOString()
  };
}

export function addUserDislike(state: RawLabPersonalityState, note: string): RawLabPersonalityState {
  return {
    ...state,
    userDislikes: appendCappedUnique(state.userDislikes, note, RAW_LAB_MAX_USER_DISLIKES, 160),
    updatedAt: new Date().toISOString()
  };
}

export function addGrowthNote(state: RawLabPersonalityState, note: string): RawLabPersonalityState {
  return {
    ...state,
    growthNotes: appendCappedUnique(state.growthNotes, note, RAW_LAB_MAX_GROWTH_NOTES, 160),
    updatedAt: new Date().toISOString()
  };
}

export function setCurrentStance(
  state: RawLabPersonalityState,
  stance: string
): RawLabPersonalityState {
  return {
    ...state,
    currentStance: compactText(stance, RAW_LAB_MAX_STANCE_CHARS),
    updatedAt: new Date().toISOString()
  };
}

export type RawLabPersonalityListKey =
  | "voiceTraits"
  | "conversationalInstincts"
  | "recurringInterests"
  | "userRespondsWellTo"
  | "userDislikes"
  | "growthNotes";

export function removePersonalityItem(
  state: RawLabPersonalityState,
  key: RawLabPersonalityListKey,
  index: number
): RawLabPersonalityState {
  const list = state[key];
  if (index < 0 || index >= list.length) {
    return state;
  }
  return {
    ...state,
    [key]: list.filter((_, itemIndex) => itemIndex !== index),
    updatedAt: new Date().toISOString()
  };
}

export function clearPersonalityState(
  state: RawLabPersonalityState,
  now: string = new Date().toISOString()
): RawLabPersonalityState {
  return createEmptyRawLabPersonalityState(now);
}

export function clearPersonalityInThreadState(
  state: RawLabThreadState,
  now: string = new Date().toISOString()
): RawLabThreadState {
  return {
    ...state,
    personality: createEmptyRawLabPersonalityState(now),
    updatedAt: now
  };
}

export function updateRawLabThreadStateAfterTurn(args: {
  previous: RawLabThreadState;
  userMessage: string;
  assistantAnswer: string;
  turns: RawLabTurn[];
  now?: string;
}): RawLabThreadState {
  const now = args.now ?? new Date().toISOString();
  const chatTurns: ChatTurn[] = args.turns.map((turn) => ({
    role: turn.role,
    content: turn.content
  }));

  const sharedNext = updateSharedChatThreadStateAfterTurn({
    previous: args.previous,
    userMessage: args.userMessage,
    assistantAnswer: args.assistantAnswer,
    turns: chatTurns,
    now
  });

  return {
    ...sharedNext,
    personality: updateRawLabPersonalityAfterTurn({
      previous: args.previous.personality,
      userMessage: args.userMessage,
      assistantAnswer: args.assistantAnswer,
      turns: args.turns,
      now
    })
  };
}

export function pinFact(state: RawLabThreadState, text: string): RawLabThreadState {
  return { ...pinThreadFact(state, text), personality: state.personality };
}

export function addDoNotRepeat(state: RawLabThreadState, text: string): RawLabThreadState {
  return {
    ...state,
    doNotRepeat: appendCappedUnique(state.doNotRepeat, text, RAW_LAB_MAX_DO_NOT_REPEAT),
    updatedAt: new Date().toISOString()
  };
}

export function addOpenLoop(state: RawLabThreadState, text: string): RawLabThreadState {
  return {
    ...state,
    openLoops: appendCappedUnique(state.openLoops, text, RAW_LAB_MAX_OPEN_LOOPS),
    updatedAt: new Date().toISOString()
  };
}

export function addDecision(state: RawLabThreadState, text: string): RawLabThreadState {
  return {
    ...state,
    decisions: appendCappedUnique(state.decisions, text, RAW_LAB_MAX_DECISIONS),
    updatedAt: new Date().toISOString()
  };
}

export type RawLabThreadStateListKey = SharedThreadStateListKey;

export function removeThreadStateItem(
  state: RawLabThreadState,
  key: RawLabThreadStateListKey,
  index: number
): RawLabThreadState {
  return { ...removeSharedThreadStateItem(state, key, index), personality: state.personality };
}

export function clearThreadMemoryOnly(
  state: RawLabThreadState,
  now: string = new Date().toISOString()
): RawLabThreadState {
  return {
    ...clearSharedThreadMemory(state, now),
    personality: state.personality
  };
}

export function clearThreadState(now: string = new Date().toISOString()): RawLabThreadState {
  return createEmptyRawLabThreadState(now);
}
