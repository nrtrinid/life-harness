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

export type RawLabReasoningDepth = "fast" | "deliberate" | "deep" | "deep_plus";

export type RawLabTurn = {
  id: string;
  role: RawLabRole;
  content: string;
  createdAt: string;
  reasoningDepth?: RawLabReasoningDepth;
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

export type RawLabSmartCompactedContext = {
  activeOpenLoops: string[];
  questionsToRevisit: string[];
  userSteering: string[];
  doNotRepeat: string[];
  recurringTopics: string[];
  provisionalStances: string[];
  selfObservations: string[];
  importantRecentMoments: string[];
  currentTension: string;
  discardedNoiseSummary: string;
  sourceTurnIds: string[];
  confidence: number;
};

export type RawLabThreadState = SharedChatThreadState & {
  recurringTopics: string[];
  currentVibe: string;
  provisionalStances: string[];
  selfObservations: string[];
  questionsToRevisit: string[];
  smartCompactedContext: RawLabSmartCompactedContext;
  personality: RawLabPersonalityState;
};

export const RAW_LAB_MAX_RECENT_TURNS = 20;
export const RAW_LAB_MAX_HISTORY_CHARS = 24_000;
export const RAW_LAB_MAX_PINNED_FACTS = 8;
export const RAW_LAB_MAX_DECISIONS = 8;
export const RAW_LAB_MAX_OPEN_LOOPS = 8;
export const RAW_LAB_MAX_DO_NOT_REPEAT = 6;
export const RAW_LAB_MAX_TONE_PREFERENCES = 8;
export const RAW_LAB_MAX_RECURRING_TOPICS = 8;
export const RAW_LAB_MAX_CURRENT_VIBE_CHARS = 180;
export const RAW_LAB_MAX_PROVISIONAL_STANCES = 6;
export const RAW_LAB_MAX_SELF_OBSERVATIONS = 6;
export const RAW_LAB_MAX_QUESTIONS_TO_REVISIT = 6;
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
export const RAW_LAB_RECURRING_TOPIC_MIN_USER_MENTIONS = 2;
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

export type RawLabWireSmartCompactedContext = {
  active_open_loops: string[];
  questions_to_revisit: string[];
  user_steering: string[];
  do_not_repeat: string[];
  recurring_topics: string[];
  provisional_stances: string[];
  self_observations: string[];
  important_recent_moments: string[];
  current_tension: string;
  discarded_noise_summary: string;
  source_turn_ids: string[];
  confidence: number;
};

export type RawLabWireThreadState = Omit<
  ReturnType<typeof toWireChatHarnessThreadState>,
  "updated_at"
> & {
  tone_preferences: string[];
  recurring_topics: string[];
  current_vibe: string;
  provisional_stances: string[];
  self_observations: string[];
  questions_to_revisit: string[];
  smart_compacted_context: RawLabWireSmartCompactedContext;
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

const RECURRING_THREAD_TOPICS: { pattern: RegExp; label: string }[] = [
  ...RECURRING_INTEREST_TOPICS,
  { pattern: /\bidentity\b/i, label: "identity/personality" },
  { pattern: /\bself[- ]?observation\b/i, label: "self-observation" },
  { pattern: /\bopen loops?\b/i, label: "open loops" },
  { pattern: /\breflection\b/i, label: "reflection" },
  { pattern: /\bpsychoanaly/i, label: "psychoanalysis-style reflection" }
];

const QUESTION_TO_REVISIT_PATTERNS = [
  /\bcome back to\b/i,
  /\brevisit\b/i,
  /\bcircle back\b/i,
  /\bwhat were we circling\b/i,
  /\bwhat are we circling\b/i,
  /\bwhat should we revisit\b/i
];

const THREAD_CIRCLING_PATTERNS = [
  /\bwhat were we circling\b/i,
  /\bwhat are we circling\b/i,
  /\bwhat was the thread\b/i,
  /\bwhat thread were we on\b/i
];

const DO_NOT_REPEAT_COMMAND_PATTERNS = [
  /\bdon(?:'|')?t keep (?:saying|calling it|framing it as)\s+["“”']?([^"“”'\n.?!]{3,100})/i,
  /\bstop (?:saying|calling it|using)\s+["“”']?([^"“”'\n.?!]{3,100})/i,
  /\bdon(?:'|')?t say\s+["“”']?([^"“”'\n.?!]{3,100})/i
];

const PROVISIONAL_STANCE_PATTERNS = [
  /\bi think(?: that)?\s+([^.!?\n]{12,180})/i,
  /\bmaybe\s+([^.!?\n]{12,180})/i,
  /\bwhat if\s+([^.!?\n]{12,180})/i,
  /\bthe idea is\s+([^.!?\n]{12,180})/i
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

export function createEmptyRawLabSmartCompactedContext(): RawLabSmartCompactedContext {
  return {
    activeOpenLoops: [],
    questionsToRevisit: [],
    userSteering: [],
    doNotRepeat: [],
    recurringTopics: [],
    provisionalStances: [],
    selfObservations: [],
    importantRecentMoments: [],
    currentTension: "",
    discardedNoiseSummary: "",
    sourceTurnIds: [],
    confidence: 0
  };
}

export function createEmptyRawLabThreadState(now: string = new Date().toISOString()): RawLabThreadState {
  return {
    ...createEmptySharedChatThreadState(now),
    recurringTopics: [],
    currentVibe: "",
    provisionalStances: [],
    selfObservations: [],
    questionsToRevisit: [],
    smartCompactedContext: createEmptyRawLabSmartCompactedContext(),
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

export function toWireSmartCompactedContext(
  context: RawLabSmartCompactedContext
): RawLabWireSmartCompactedContext {
  return {
    active_open_loops: context.activeOpenLoops,
    questions_to_revisit: context.questionsToRevisit,
    user_steering: context.userSteering,
    do_not_repeat: context.doNotRepeat,
    recurring_topics: context.recurringTopics,
    provisional_stances: context.provisionalStances,
    self_observations: context.selfObservations,
    important_recent_moments: context.importantRecentMoments,
    current_tension: compactText(context.currentTension, 180),
    discarded_noise_summary: compactText(context.discardedNoiseSummary, 220),
    source_turn_ids: context.sourceTurnIds,
    confidence: Math.max(0, Math.min(1, context.confidence))
  };
}

export function toWireThreadState(state: RawLabThreadState): RawLabWireThreadState {
  const shared = toWireChatHarnessThreadState(state);
  return {
    ...shared,
    tone_preferences: state.userSteering,
    recurring_topics: state.recurringTopics,
    current_vibe: compactText(state.currentVibe, RAW_LAB_MAX_CURRENT_VIBE_CHARS),
    provisional_stances: state.provisionalStances,
    self_observations: state.selfObservations,
    questions_to_revisit: state.questionsToRevisit,
    smart_compacted_context: toWireSmartCompactedContext(
      state.smartCompactedContext ?? createEmptyRawLabSmartCompactedContext()
    ),
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

function detectRecurringTopicsFromUserTurns(userTexts: string[]): string[] {
  const found: string[] = [];
  for (const { pattern, label } of RECURRING_THREAD_TOPICS) {
    const matches = userTexts.filter((text) => pattern.test(text)).length;
    if (matches >= RAW_LAB_RECURRING_TOPIC_MIN_USER_MENTIONS) {
      found.push(label);
    }
  }
  return [...new Set(found)];
}

function detectDoNotRepeatCommands(userMessage: string): string[] {
  const snippets: string[] = [];
  for (const pattern of DO_NOT_REPEAT_COMMAND_PATTERNS) {
    const match = userMessage.match(pattern);
    const snippet = match?.[1]?.trim();
    if (snippet) {
      snippets.push(compactText(snippet.replace(/[”"']+$/g, ""), 120));
    }
  }
  return snippets;
}

function detectQuestionsToRevisit(userMessage: string): string[] {
  const trimmed = userMessage.trim();
  if (!trimmed || containsSensitiveInference(trimmed)) {
    return [];
  }
  if (!QUESTION_TO_REVISIT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return [];
  }
  return [compactText(trimmed, 180)];
}

const BUILD_INTENT_RE =
  /\b(code|python|script|skeleton|implementation|prototype|artifact|build|project|game|plan)\b/i;
const FALSE_EXECUTION_CONCERN_RE =
  /\b(ran the code|run the code|actually execute|did you run|claim you ran)\b/i;
const HANDOFF_INDEPENDENCE_RE =
  /\b(handoff|independent|initiative|what'?s next|stop checking in)\b/i;
const NAMING_RAW_LAB_RE =
  /\b(call you|your name|name (?:you|raw lab)|(?:lily|luna)\b|name (?:for )?raw lab)\b/i;
const HOSTILE_OR_INSULT_RE =
  /\b(you'?re dumb|you are dumb|stupid|idiot|worthless|shut up)\b/i;

function detectProvisionalStances(userMessage: string): string[] {
  if (containsSensitiveInference(userMessage)) {
    return [];
  }
  const stances: string[] = [];
  for (const pattern of PROVISIONAL_STANCE_PATTERNS) {
    const match = userMessage.match(pattern);
    const idea = match?.[1]?.trim();
    if (!idea) {
      continue;
    }
    const normalized = normalizeProvisionalStance(`Provisional stance: exploring whether ${idea}`);
    if (normalized) {
      stances.push(normalized);
    }
  }
  if (BUILD_INTENT_RE.test(userMessage) && !stances.length) {
    const normalized = normalizeProvisionalStance(userMessage);
    if (normalized) {
      stances.push(normalized);
    }
  }
  return stances;
}

function buildCurrentVibe(args: {
  userSteering: string[];
  recurringTopics: string[];
  personality: RawLabPersonalityState;
}): string {
  const parts: string[] = [];
  if (args.userSteering.length > 0) {
    parts.push(`steered toward ${args.userSteering.slice(0, 2).join(", ")}`);
  }
  if (args.personality.voiceTraits.length > 0) {
    parts.push(`voice ${args.personality.voiceTraits.slice(0, 2).join(", ")}`);
  }
  if (args.recurringTopics.length > 0) {
    parts.push(`circling ${args.recurringTopics.slice(0, 2).join(" and ")}`);
  }
  if (parts.length === 0) {
    return "";
  }
  return compactText(
    `Current vibe in this chat: ${parts.join("; ")}.`,
    RAW_LAB_MAX_CURRENT_VIBE_CHARS
  );
}

function buildSelfObservations(args: {
  recurringTopics: string[];
  userSteering: string[];
  personality: RawLabPersonalityState;
}): string[] {
  const observations: string[] = [];
  if (args.recurringTopics.length > 0) {
    observations.push(
      `I'm noticing I tend to circle ${args.recurringTopics[0]} with you in this thread.`
    );
  }
  if (args.personality.conversationalInstincts.length > 0) {
    observations.push(
      `I'm noticing my instinct here is to ${args.personality.conversationalInstincts[0]}.`
    );
  }
  return observations
    .map((item) => sanitizeRawLabMemoryProposal(item, "selfObservation"))
    .filter((item): item is string => Boolean(item));
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

export function addRecurringTopic(state: RawLabThreadState, topic: string): RawLabThreadState {
  return {
    ...state,
    recurringTopics: appendCappedUnique(
      state.recurringTopics,
      topic,
      RAW_LAB_MAX_RECURRING_TOPICS,
      120
    ),
    updatedAt: new Date().toISOString()
  };
}

export function setCurrentVibe(state: RawLabThreadState, vibe: string): RawLabThreadState {
  return {
    ...state,
    currentVibe: compactText(vibe, RAW_LAB_MAX_CURRENT_VIBE_CHARS),
    updatedAt: new Date().toISOString()
  };
}

export function addProvisionalStance(state: RawLabThreadState, stance: string): RawLabThreadState {
  return {
    ...state,
    provisionalStances: appendCappedUnique(
      state.provisionalStances,
      stance,
      RAW_LAB_MAX_PROVISIONAL_STANCES,
      180
    ),
    updatedAt: new Date().toISOString()
  };
}

export function addSelfObservation(
  state: RawLabThreadState,
  observation: string
): RawLabThreadState {
  return {
    ...state,
    selfObservations: appendCappedUnique(
      state.selfObservations,
      observation,
      RAW_LAB_MAX_SELF_OBSERVATIONS,
      180
    ),
    updatedAt: new Date().toISOString()
  };
}

export function addQuestionToRevisit(
  state: RawLabThreadState,
  question: string
): RawLabThreadState {
  return {
    ...state,
    questionsToRevisit: appendCappedUnique(
      state.questionsToRevisit,
      question,
      RAW_LAB_MAX_QUESTIONS_TO_REVISIT,
      180
    ),
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

  let next: RawLabThreadState = {
    ...args.previous,
    ...sharedNext,
    personality: updateRawLabPersonalityAfterTurn({
      previous: args.previous.personality,
      userMessage: args.userMessage,
      assistantAnswer: args.assistantAnswer,
      turns: args.turns,
      now
    })
  };

  const userMessage = args.userMessage.trim();
  const recentUserTexts = userTurnTexts(args.turns.slice(-RAW_LAB_PERSONALITY_TURN_SCAN_COUNT));

  if (!containsSensitiveInference(userMessage)) {
    for (const snippet of detectDoNotRepeatCommands(userMessage)) {
      next = addDoNotRepeat(next, snippet);
    }
    for (const topic of detectRecurringTopicsFromUserTurns(recentUserTexts)) {
      next = addRecurringTopic(next, topic);
    }
    for (const stance of detectProvisionalStances(userMessage)) {
      next = addProvisionalStance(next, stance);
    }
    for (const question of detectQuestionsToRevisit(userMessage)) {
      next = addQuestionToRevisit(next, question);
    }

    const vibe = buildCurrentVibe({
      userSteering: next.userSteering,
      recurringTopics: next.recurringTopics,
      personality: next.personality
    });
    if (vibe) {
      next = setCurrentVibe(next, vibe);
    }

    for (const observation of buildSelfObservations({
      recurringTopics: next.recurringTopics,
      userSteering: next.userSteering,
      personality: next.personality
    })) {
      next = addSelfObservation(next, observation);
    }
  }

  if (THREAD_CIRCLING_PATTERNS.some((pattern) => pattern.test(userMessage))) {
    next = addQuestionToRevisit(next, userMessage);
  }

  return { ...next, updatedAt: now };
}

export function pinFact(state: RawLabThreadState, text: string): RawLabThreadState {
  return { ...state, ...pinThreadFact(state, text), personality: state.personality };
}

export function addDoNotRepeat(state: RawLabThreadState, text: string): RawLabThreadState {
  return {
    ...state,
    doNotRepeat: appendCappedUnique(state.doNotRepeat, text, RAW_LAB_MAX_DO_NOT_REPEAT),
    updatedAt: new Date().toISOString()
  };
}

export function addUserSteering(state: RawLabThreadState, text: string): RawLabThreadState {
  return {
    ...state,
    userSteering: appendCappedUnique(state.userSteering, text, MAX_USER_STEERING, 120),
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

export type RawLabMindListKey =
  | "recurringTopics"
  | "provisionalStances"
  | "selfObservations"
  | "questionsToRevisit";

export type RawLabThreadStateListKey = SharedThreadStateListKey | RawLabMindListKey;

export function removeThreadStateItem(
  state: RawLabThreadState,
  key: RawLabThreadStateListKey,
  index: number
): RawLabThreadState {
  if (
    key === "recurringTopics" ||
    key === "provisionalStances" ||
    key === "selfObservations" ||
    key === "questionsToRevisit"
  ) {
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
  return { ...state, ...removeSharedThreadStateItem(state, key, index), personality: state.personality };
}

export function clearThreadMemoryOnly(
  state: RawLabThreadState,
  now: string = new Date().toISOString()
): RawLabThreadState {
  return {
    ...clearSharedThreadMemory(state, now),
    recurringTopics: [],
    currentVibe: "",
    provisionalStances: [],
    selfObservations: [],
    questionsToRevisit: [],
    smartCompactedContext: createEmptyRawLabSmartCompactedContext(),
    personality: state.personality
  };
}

export function clearThreadState(now: string = new Date().toISOString()): RawLabThreadState {
  return createEmptyRawLabThreadState(now);
}

export type RawLabMemoryItemKind =
  | "doNotRepeat"
  | "provisionalStance"
  | "selfObservation"
  | "userSteering"
  | "openLoop"
  | "recurringTopic"
  | "questionToRevisit"
  | "currentVibe"
  | "pinnedFact"
  | "decision";

export const RAW_LAB_DISPLAY_MEMORY_MAX_CHARS = 180;

const RAW_ASSISTANT_OPENER_PATTERNS = [
  /^got it\b/i,
  /^bro\b/i,
  /^sure thing\b/i,
  /^you'?re welcome\b/i,
  /^absolutely\b/i,
  /^i'?m glad\b/i,
  /^happy to help\b/i,
  /^let'?s dive in\b/i,
  /^i'?ll help\b/i
];

const RAW_ASSISTANT_HANDOFF_ECHO_PATTERNS = [
  /what'?s your take/i,
  /ready to pivot/i,
  /let'?s see where this goes/i,
  /^i'?m ready[.!]?$/i,
  /^i'?m all ears\b/i,
  /ready to see/i,
  /what do you want me to do/i
];

const COMPACT_DO_NOT_REPEAT_PHRASES = [
  "what's next",
  "whats next",
  "what's your take",
  "ready to pivot",
  "i'm all ears",
  "ready to see it",
  "what's on your mind"
];

const STANCE_ARTIFACT =
  "Raw Lab should produce the next concrete artifact once the user has approved a build direction.";
const STANCE_FALSE_EXECUTION =
  "Raw Lab should not claim code ran unless it actually executed code.";
const STANCE_HANDOFF_ENGAGEMENT =
  "Engagement should come from carrying a thread forward, not reflexive check-in questions.";

function normalizeMemoryKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function isCompactDoNotRepeatPhrase(text: string): boolean {
  const key = normalizeMemoryKey(text).replace(/[?.!]+$/g, "");
  return COMPACT_DO_NOT_REPEAT_PHRASES.some(
    (phrase) => key === phrase || key.startsWith(`${phrase} `)
  );
}

export function isNoisyRawLabAssistantSnippet(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.includes("```")) {
    return true;
  }
  if (trimmed.length > RAW_LAB_DISPLAY_MEMORY_MAX_CHARS + 40) {
    return true;
  }
  return (
    RAW_ASSISTANT_OPENER_PATTERNS.some((pattern) => pattern.test(trimmed)) ||
    RAW_ASSISTANT_HANDOFF_ECHO_PATTERNS.some((pattern) => pattern.test(trimmed))
  );
}

export function isMalformedProvisionalStance(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (/^provisional stance:\s*exploring whether\b/i.test(trimmed)) {
    return true;
  }
  if (isNoisyRawLabAssistantSnippet(trimmed)) {
    return true;
  }
  if (isRawUserQuestionMemory(trimmed)) {
    return true;
  }
  return false;
}

function extractExploringWhetherPayload(text: string): string {
  const match = text.match(/^provisional stance:\s*exploring whether\s+(.+)$/i);
  return (match?.[1] ?? text).trim().replace(/[?.!]+$/g, "");
}

function extractRawLabNameCandidate(text: string): string | null {
  const match = text.match(/\b(lily|luna)\b/i);
  if (match) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    return `Potential temporary name candidate for Raw Lab: ${name}.`;
  }
  return null;
}

export function normalizeProvisionalStance(text: string): string | null {
  const payload = extractExploringWhetherPayload(text);
  if (!payload || HOSTILE_OR_INSULT_RE.test(payload)) {
    return null;
  }
  if (NAMING_RAW_LAB_RE.test(payload) || /\b(lily|luna)\b/i.test(payload)) {
    return extractRawLabNameCandidate(payload);
  }
  if (FALSE_EXECUTION_CONCERN_RE.test(payload)) {
    return STANCE_FALSE_EXECUTION;
  }
  if (HANDOFF_INDEPENDENCE_RE.test(payload)) {
    return STANCE_HANDOFF_ENGAGEMENT;
  }
  if (BUILD_INTENT_RE.test(payload)) {
    return STANCE_ARTIFACT;
  }
  if (/^provisional stance:\s*exploring whether\b/i.test(text)) {
    return null;
  }
  const stripped = text.replace(/^provisional stance:\s*/i, "").trim();
  if (stripped.length >= 24 && !isNoisyRawLabAssistantSnippet(stripped)) {
    return compactText(stripped, RAW_LAB_DISPLAY_MEMORY_MAX_CHARS);
  }
  return null;
}

export function isRawUserQuestionMemory(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !trimmed.endsWith("?")) {
    return false;
  }
  if (QUESTION_TO_REVISIT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }
  if (THREAD_CIRCLING_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }
  if (/^how (does|should|do|can|would)\b/i.test(trimmed)) {
    return false;
  }
  if (trimmed.length >= 80) {
    return false;
  }
  return trimmed.length < 120;
}

export function normalizeRawLabMemoryItem(
  text: string,
  kind: RawLabMemoryItemKind
): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (kind === "provisionalStance") {
    return normalizeProvisionalStance(trimmed);
  }
  if (kind === "doNotRepeat") {
    return compactText(trimmed.replace(/^["']|["']$/g, ""), 120);
  }
  if (isNoisyRawLabAssistantSnippet(trimmed)) {
    return null;
  }
  if (kind === "questionToRevisit" && isRawUserQuestionMemory(trimmed)) {
    return null;
  }
  return compactText(trimmed, RAW_LAB_DISPLAY_MEMORY_MAX_CHARS);
}

function shouldRejectMemoryItem(text: string, kind: RawLabMemoryItemKind): boolean {
  if (kind === "doNotRepeat") {
    if (isNoisyRawLabAssistantSnippet(text) && !isCompactDoNotRepeatPhrase(text)) {
      return true;
    }
    return false;
  }
  if (kind === "provisionalStance") {
    if (isCompactDoNotRepeatPhrase(text)) {
      return true;
    }
    return isMalformedProvisionalStance(text) || !normalizeProvisionalStance(text);
  }
  if (kind === "selfObservation" || kind === "userSteering") {
    if (isCompactDoNotRepeatPhrase(text)) {
      return true;
    }
  }
  if (kind === "selfObservation" || kind === "userSteering") {
    if (isNoisyRawLabAssistantSnippet(text)) {
      return true;
    }
    if (kind === "selfObservation" && /^i'?m noticing i adapt when you steer me toward\b/i.test(text)) {
      return true;
    }
  }
  if (kind === "questionToRevisit" && isRawUserQuestionMemory(text)) {
    return true;
  }
  if (isNoisyRawLabAssistantSnippet(text)) {
    return true;
  }
  return false;
}

export function filterDisplayThreadMemoryItems(
  items: string[],
  kind: RawLabMemoryItemKind = "selfObservation"
): string[] {
  const seen = new Set<string>();
  const filtered: string[] = [];
  for (const item of items) {
    if (shouldRejectMemoryItem(item, kind)) {
      continue;
    }
    const normalized =
      kind === "provisionalStance"
        ? normalizeProvisionalStance(item)
        : normalizeRawLabMemoryItem(item, kind);
    if (!normalized) {
      continue;
    }
    const key = normalizeMemoryKey(normalized);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    filtered.push(normalized);
  }
  return filtered;
}

export type RawLabDisplayThreadMemoryState = Pick<
  RawLabThreadState,
  | "userSteering"
  | "doNotRepeat"
  | "provisionalStances"
  | "selfObservations"
  | "openLoops"
  | "recurringTopics"
  | "currentVibe"
  | "questionsToRevisit"
  | "pinnedFacts"
  | "decisions"
>;

export function buildDisplayThreadMemoryState(
  state: RawLabThreadState
): RawLabDisplayThreadMemoryState {
  return {
    userSteering: filterDisplayThreadMemoryItems(state.userSteering, "userSteering"),
    doNotRepeat: filterDisplayThreadMemoryItems(state.doNotRepeat, "doNotRepeat"),
    provisionalStances: filterDisplayThreadMemoryItems(
      state.provisionalStances,
      "provisionalStance"
    ),
    selfObservations: filterDisplayThreadMemoryItems(
      state.selfObservations,
      "selfObservation"
    ),
    openLoops: filterDisplayThreadMemoryItems(state.openLoops, "openLoop"),
    recurringTopics: filterDisplayThreadMemoryItems(state.recurringTopics, "recurringTopic"),
    currentVibe: filterDisplayThreadMemoryItems(
      state.currentVibe ? [state.currentVibe] : [],
      "currentVibe"
    ).join(""),
    questionsToRevisit: filterDisplayThreadMemoryItems(
      state.questionsToRevisit,
      "questionToRevisit"
    ),
    pinnedFacts: filterDisplayThreadMemoryItems(state.pinnedFacts, "pinnedFact"),
    decisions: filterDisplayThreadMemoryItems(state.decisions, "decision")
  };
}

export function sanitizeRawLabMemoryProposal(
  text: string,
  kind: RawLabMemoryItemKind
): string | null {
  if (shouldRejectMemoryItem(text, kind)) {
    return null;
  }
  return normalizeRawLabMemoryItem(text, kind);
}
