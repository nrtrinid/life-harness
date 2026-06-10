export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  content: string;
};

export type ThreadTaskMode =
  | "casual"
  | "ask_factual"
  | "teach"
  | "write_code"
  | "debug"
  | "brainstorm"
  | "plan"
  | "reflect"
  | "roleplay"
  | "style_steering"
  | "grounded_operator"
  | "builder";

export type ThreadCodeBlock = {
  language: string;
  code: string;
  purpose?: string;
};

export type ThreadReferenceState = {
  lastOptions: string[];
  lastCodeBlock?: ThreadCodeBlock;
  lastPlan?: string;
  lastNamedThing?: string;
  likelyReference?: string;
};

export type SharedChatThreadState = {
  recentDigest: string;
  activeGoal: string;
  currentTopic: string;
  taskMode: ThreadTaskMode;
  openLoops: string[];
  decisions: string[];
  pinnedFacts: string[];
  userSteering: string[];
  doNotRepeat: string[];
  references: ThreadReferenceState;
  updatedAt: string;
};

export const CHAT_HARNESS_MAX_HISTORY_TURNS = 8;
export const CHAT_HARNESS_MAX_HISTORY_CHARS = 6000;

export const MAX_OPEN_LOOPS = 8;
export const MAX_DECISIONS = 8;
export const MAX_PINNED_FACTS = 8;
export const MAX_USER_STEERING = 8;
export const MAX_DO_NOT_REPEAT = 6;
export const MAX_LAST_OPTIONS = 6;
export const DIGEST_TURN_COUNT = 6;
export const DIGEST_MAX_CHARS = 600;
export const GOAL_TOPIC_MAX_CHARS = 220;
export const DO_NOT_REPEAT_MIN_ANSWER_CHARS = 120;
export const DO_NOT_REPEAT_SNIPPET_CHARS = 100;

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

const USER_STEERING_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bbe blunt\b/i, label: "be blunt" },
  { pattern: /\bmake it shorter\b/i, label: "make it shorter" },
  { pattern: /\bmore direct\b/i, label: "more direct" },
  { pattern: /\bless corporate\b/i, label: "less corporate" },
  { pattern: /\bmore detailed\b/i, label: "more detailed" },
  { pattern: /\bbe playful\b/i, label: "be playful" },
  { pattern: /\bmake it weirder\b/i, label: "make it weirder" },
  { pattern: /\bmore analytical\b/i, label: "more analytical" }
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

export type WireChatHarnessThreadState = {
  recent_digest: string;
  active_goal: string;
  current_topic: string;
  task_mode: ThreadTaskMode;
  open_loops: string[];
  decisions: string[];
  pinned_facts: string[];
  user_steering: string[];
  do_not_repeat: string[];
  references: {
    last_options: string[];
    last_code_block?: {
      language: string;
      code: string;
      purpose?: string;
    };
    last_plan?: string;
    last_named_thing?: string;
    likely_reference?: string;
  };
  updated_at: string;
};

export function compactText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  if (maxChars <= 3) {
    return normalized.slice(0, maxChars);
  }
  return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
}

function estimateTurnsChars(turns: ChatTurn[]): number {
  return JSON.stringify(turns).length;
}

export function trimConversationTurns(
  turns: ChatTurn[],
  options: { maxTurns?: number; maxChars?: number } = {}
): ChatTurn[] {
  const maxTurns = options.maxTurns ?? CHAT_HARNESS_MAX_HISTORY_TURNS;
  const maxChars = options.maxChars ?? CHAT_HARNESS_MAX_HISTORY_CHARS;

  let trimmed = turns
    .filter((turn) => turn.content.trim().length > 0)
    .slice(-maxTurns);

  while (trimmed.length > 0 && estimateTurnsChars(trimmed) > maxChars) {
    trimmed = trimmed.slice(1);
  }

  return trimmed;
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

export function createEmptyThreadReferenceState(): ThreadReferenceState {
  return { lastOptions: [] };
}

export function createEmptySharedChatThreadState(
  now: string = new Date().toISOString()
): SharedChatThreadState {
  return {
    recentDigest: "",
    activeGoal: "",
    currentTopic: "",
    taskMode: "casual",
    openLoops: [],
    decisions: [],
    pinnedFacts: [],
    userSteering: [],
    doNotRepeat: [],
    references: createEmptyThreadReferenceState(),
    updatedAt: now
  };
}

export function buildRecentDigest(turns: ChatTurn[]): string {
  const recent = turns.slice(-DIGEST_TURN_COUNT);
  if (recent.length === 0) {
    return "";
  }
  const lines = recent.map((turn) => `${turn.role}: ${turn.content}`);
  return compactText(lines.join(" | "), DIGEST_MAX_CHARS);
}

export function detectOpenLoops(userMessage: string): string[] {
  const trimmed = userMessage.trim();
  if (!trimmed || !OPEN_LOOP_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return [];
  }
  return [compactText(trimmed, 160)];
}

export function detectUserSteering(userMessage: string): string[] {
  return USER_STEERING_PATTERNS.filter(({ pattern }) => pattern.test(userMessage)).map(
    ({ label }) => label
  );
}

export function deriveDoNotRepeatSnippet(assistantAnswer: string): string | null {
  if (assistantAnswer.length < DO_NOT_REPEAT_MIN_ANSWER_CHARS) {
    return null;
  }
  const snippet = compactText(assistantAnswer, DO_NOT_REPEAT_SNIPPET_CHARS);
  return snippet || null;
}

function containsSensitiveInference(text: string): boolean {
  return SENSITIVE_INFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isSensitiveThreadLine(text: string): boolean {
  return containsSensitiveInference(text);
}

export function classifyTurnIntent(userMessage: string): ThreadTaskMode {
  const text = userMessage.toLowerCase();
  if (/\bteach me\b|\bexplain\b|\bhow do i\b|\bwalk me through\b/.test(text)) {
    return /\bcode\b|\bloop\b|\bfunction\b|\bpython\b|\bjavascript\b/.test(text)
      ? "write_code"
      : "teach";
  }
  if (/\bwrite\b.*\bcode\b|\bcode snippet\b|\bimplement\b/.test(text)) {
    return "write_code";
  }
  if (/\bdebug\b|\berror\b|\bstack trace\b|\bnot working\b/.test(text)) {
    return "debug";
  }
  if (/\bbrainstorm\b|\bideas\b|\boptions\b/.test(text)) {
    return "brainstorm";
  }
  if (/\bplan\b|\bimplementation prompt\b|\broadmap\b|\bhow would we build\b/.test(text)) {
    return "plan";
  }
  if (/\breflect\b|\bwhy do i\b|\bpattern\b|\bavoiding\b/.test(text)) {
    return "reflect";
  }
  if (/\broleplay\b|\bpretend\b/.test(text)) {
    return "roleplay";
  }
  if (/\bshorter\b|\bblunt\b|\bplayful\b|\bweirder\b|\bmore direct\b|\banalytical\b/.test(text)) {
    return "style_steering";
  }
  if (/\bwhat should i do\b|\bnext move\b|\boperator\b/.test(text)) {
    return "grounded_operator";
  }
  if (/\bbuild\b|\bship\b|\bfeature\b|\bticket\b/.test(text)) {
    return "builder";
  }
  if (/\bwhat is\b|\bwho is\b|\bdefine\b/.test(text)) {
    return "ask_factual";
  }
  return "casual";
}

export function inferActiveGoalAndTopic(args: {
  previous: SharedChatThreadState;
  userMessage: string;
  turns: ChatTurn[];
}): { activeGoal: string; currentTopic: string } {
  const userMessage = args.userMessage.trim();
  let activeGoal = args.previous.activeGoal;
  let currentTopic = args.previous.currentTopic;

  if (!activeGoal && userMessage.length >= 12 && !containsSensitiveInference(userMessage)) {
    activeGoal = compactText(userMessage, GOAL_TOPIC_MAX_CHARS);
  }

  if (userMessage && !containsSensitiveInference(userMessage)) {
    currentTopic = compactText(userMessage, GOAL_TOPIC_MAX_CHARS);
  } else {
    const lastUser = [...args.turns].reverse().find((turn) => turn.role === "user");
    if (lastUser) {
      currentTopic = compactText(lastUser.content, GOAL_TOPIC_MAX_CHARS);
    }
  }

  return { activeGoal, currentTopic };
}

export function updateSharedChatThreadStateAfterTurn(args: {
  previous: SharedChatThreadState;
  userMessage: string;
  assistantAnswer: string;
  turns: ChatTurn[];
  now?: string;
}): SharedChatThreadState {
  const now = args.now ?? new Date().toISOString();
  const userMessage = args.userMessage.trim();

  const { activeGoal, currentTopic } = inferActiveGoalAndTopic({
    previous: args.previous,
    userMessage,
    turns: args.turns
  });

  let next: SharedChatThreadState = {
    ...args.previous,
    recentDigest: buildRecentDigest(args.turns),
    activeGoal,
    currentTopic,
    taskMode: classifyTurnIntent(userMessage),
    updatedAt: now
  };

  if (!containsSensitiveInference(userMessage)) {
    for (const loop of detectOpenLoops(userMessage)) {
      next = {
        ...next,
        openLoops: appendCappedUnique(next.openLoops, loop, MAX_OPEN_LOOPS)
      };
    }

    for (const steering of detectUserSteering(userMessage)) {
      next = {
        ...next,
        userSteering: appendCappedUnique(next.userSteering, steering, MAX_USER_STEERING, 120)
      };
    }
  }

  const doNotRepeatSnippet = deriveDoNotRepeatSnippet(args.assistantAnswer);
  if (doNotRepeatSnippet) {
    next = {
      ...next,
      doNotRepeat: appendCappedUnique(next.doNotRepeat, doNotRepeatSnippet, MAX_DO_NOT_REPEAT)
    };
  }

  const lastOptions = extractLastOptions(args.assistantAnswer);
  const lastCodeBlock = extractLastCodeBlock(args.assistantAnswer);
  next = {
    ...next,
    references: {
      ...next.references,
      ...(lastOptions.length > 0 ? { lastOptions } : {}),
      ...(lastCodeBlock ? { lastCodeBlock } : {})
    }
  };

  return next;
}

export function extractLastOptions(assistantAnswer: string): string[] {
  const options: string[] = [];
  const lines = assistantAnswer.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    const optionMatch = trimmed.match(/^option\s+[a-z]\s*:\s*(.+)$/i);
    if (optionMatch?.[1]) {
      options.push(compactText(optionMatch[1], 120));
      continue;
    }
    const letterMatch = trimmed.match(/^[A-D]\)\s*(.+)$/i);
    if (letterMatch?.[1]) {
      options.push(compactText(letterMatch[1], 120));
      continue;
    }
    const numberedMatch = trimmed.match(/^\d+\.\s*(.+)$/);
    if (numberedMatch?.[1] && options.length < MAX_LAST_OPTIONS) {
      options.push(compactText(numberedMatch[1], 120));
    }
  }

  return options.slice(0, MAX_LAST_OPTIONS);
}

export function extractLastCodeBlock(assistantAnswer: string): ThreadCodeBlock | undefined {
  const match = assistantAnswer.match(/```(\w*)\n([\s\S]*?)```/);
  if (!match) {
    return undefined;
  }
  const code = match[2]?.trim();
  if (!code) {
    return undefined;
  }
  return {
    language: match[1]?.trim() || "text",
    code
  };
}

export function resolveLikelyReference(args: {
  userMessage: string;
  state: SharedChatThreadState;
}): string | undefined {
  const text = args.userMessage.trim().toLowerCase();
  const { references, currentTopic, userSteering } = args.state;

  if (/^(continue|go on|keep going)\b/.test(text)) {
    return currentTopic || references.lastPlan || undefined;
  }

  if (/\bsame style\b/.test(text) && userSteering.length > 0) {
    return userSteering[0];
  }

  const ordinalMatch = text.match(/\b(first|second|third|1st|2nd|3rd|one|two|three)\b/);
  if (ordinalMatch && references.lastOptions.length > 0) {
    const indexMap: Record<string, number> = {
      first: 0,
      "1st": 0,
      one: 0,
      second: 1,
      "2nd": 1,
      two: 1,
      third: 2,
      "3rd": 2,
      three: 2
    };
    const index = indexMap[ordinalMatch[1] ?? ""] ?? -1;
    if (index >= 0 && index < references.lastOptions.length) {
      return references.lastOptions[index];
    }
  }

  const optionLetterMatch = text.match(/\boption\s+([a-d])\b/);
  if (optionLetterMatch && references.lastOptions.length > 0) {
    const index = optionLetterMatch[1].charCodeAt(0) - "a".charCodeAt(0);
    if (index >= 0 && index < references.lastOptions.length) {
      return references.lastOptions[index];
    }
  }

  if (
    /\b(add to|modify|change|update).*(code|snippet|script)\b/.test(text) ||
    /\badd inventory\b/.test(text) ||
    /\bmake it loop\b/.test(text)
  ) {
    if (references.lastCodeBlock) {
      return references.lastCodeBlock.purpose || "previous code block";
    }
  }

  if (/^(that|this)\b/.test(text)) {
    return (
      references.lastNamedThing ||
      references.lastOptions[references.lastOptions.length - 1] ||
      currentTopic ||
      undefined
    );
  }

  return undefined;
}

export function applyLikelyReferenceForSend(
  state: SharedChatThreadState,
  userMessage: string
): SharedChatThreadState {
  const likelyReference = resolveLikelyReference({ userMessage, state });
  if (!likelyReference) {
    return state;
  }
  return {
    ...state,
    references: {
      ...state.references,
      likelyReference: compactText(likelyReference, 220)
    },
    updatedAt: new Date().toISOString()
  };
}

function tokenizeForRelevance(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((token) => token.length >= 3)
  );
}

function scoreTurnRelevance(turn: ChatTurn, latestMessage: string, state: SharedChatThreadState): number {
  const messageTokens = tokenizeForRelevance(latestMessage);
  const turnTokens = tokenizeForRelevance(turn.content);
  let score = 0;
  for (const token of turnTokens) {
    if (messageTokens.has(token)) {
      score += 2;
    }
  }
  for (const option of state.references.lastOptions) {
    if (turn.content.toLowerCase().includes(option.toLowerCase())) {
      score += 3;
    }
  }
  if (state.currentTopic && turn.content.toLowerCase().includes(state.currentTopic.toLowerCase())) {
    score += 2;
  }
  if (state.activeGoal && turn.content.toLowerCase().includes(state.activeGoal.toLowerCase())) {
    score += 1;
  }
  return score;
}

export function packConversationHistoryForGateway(args: {
  turns: ChatTurn[];
  state: SharedChatThreadState;
  latestMessage: string;
  maxChars: number;
  alwaysIncludeRecentTurns?: number;
}): ChatTurn[] {
  const alwaysInclude = args.alwaysIncludeRecentTurns ?? CHAT_HARNESS_MAX_HISTORY_TURNS;
  const recent = trimConversationTurns(args.turns.slice(-alwaysInclude), {
    maxTurns: alwaysInclude,
    maxChars: args.maxChars
  });

  if (estimateTurnsChars(recent) >= args.maxChars) {
    return recent;
  }

  const older = args.turns.slice(0, Math.max(0, args.turns.length - alwaysInclude));
  const ranked = older
    .map((turn, index) => ({
      turn,
      index,
      score: scoreTurnRelevance(turn, args.latestMessage, args.state)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.index - left.index);

  let packed = [...recent];
  for (const entry of ranked) {
    const candidate = trimConversationTurns([entry.turn, ...packed], {
      maxTurns: alwaysInclude + 4,
      maxChars: args.maxChars
    });
    if (estimateTurnsChars(candidate) <= args.maxChars) {
      packed = candidate;
    }
  }

  return trimConversationTurns(packed, { maxChars: args.maxChars });
}

export const RESPONSE_VARIANTS = [
  { label: "Shorter", prompt: "Make that shorter while keeping the same point." },
  { label: "Sharper", prompt: "Be more direct and sharper." },
  { label: "Continue", prompt: "Continue." },
  { label: "Analytical", prompt: "Give a more analytical breakdown." },
  { label: "Playful", prompt: "Answer in a more playful tone." },
  { label: "Turn into plan", prompt: "Turn that into a concrete step-by-step plan." },
  { label: "Explain simply", prompt: "Explain that like I'm new to the topic." }
] as const;

export const RESPONSE_VARIANTS_PRIMARY_COUNT = 3;

export function buildGroundedHandoffDigest(args: {
  state: SharedChatThreadState;
  recentUserMessages: string[];
}): string {
  const parts: string[] = [
    "I was exploring this in Raw Signal (ungrounded). Please help with board context:"
  ];
  if (args.state.activeGoal) {
    parts.push(`Goal: ${compactText(args.state.activeGoal, 220)}`);
  }
  if (args.state.currentTopic) {
    parts.push(`Topic: ${compactText(args.state.currentTopic, 220)}`);
  }
  if (args.state.recentDigest) {
    parts.push(`Thread summary: ${compactText(args.state.recentDigest, 400)}`);
  }
  if (args.state.openLoops.length > 0) {
    parts.push(`Open loop: ${compactText(args.state.openLoops[0], 120)}`);
  }
  const recent = args.recentUserMessages
    .slice(-2)
    .map((message) => compactText(message, 160))
    .filter(Boolean);
  if (recent.length > 0) {
    parts.push(`Recent questions: ${recent.join(" | ")}`);
  }
  return parts.join("\n");
}

const GROUNDED_HANDOFF_PATTERNS = [
  /\bmy board\b/i,
  /\bactive cards?\b/i,
  /\bwhat should i do next\b/i,
  /\bmy cards\b/i,
  /\bmomentum board\b/i,
  /\blife harness card\b/i
];

export function shouldSuggestGroundedHandoff(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }
  return GROUNDED_HANDOFF_PATTERNS.some((pattern) => pattern.test(text));
}

export function applyVariantPromptToThreadState(
  state: SharedChatThreadState,
  prompt: string
): SharedChatThreadState {
  let next = { ...state };
  for (const steering of detectUserSteering(prompt)) {
    next = {
      ...next,
      userSteering: appendCappedUnique(next.userSteering, steering, MAX_USER_STEERING, 120)
    };
  }
  const intent = classifyTurnIntent(prompt);
  if (intent !== "casual") {
    next = { ...next, taskMode: intent };
  }
  return { ...next, updatedAt: new Date().toISOString() };
}

export function pinThreadFact(state: SharedChatThreadState, text: string): SharedChatThreadState {
  return {
    ...state,
    pinnedFacts: appendCappedUnique(state.pinnedFacts, text, MAX_PINNED_FACTS),
    updatedAt: new Date().toISOString()
  };
}

export type SharedThreadStateListKey =
  | "openLoops"
  | "decisions"
  | "pinnedFacts"
  | "userSteering"
  | "doNotRepeat";

export function removeSharedThreadStateItem(
  state: SharedChatThreadState,
  key: SharedThreadStateListKey,
  index: number
): SharedChatThreadState {
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

export function clearSharedThreadMemory(
  state: SharedChatThreadState,
  now: string = new Date().toISOString()
): SharedChatThreadState {
  return {
    ...state,
    recentDigest: "",
    activeGoal: "",
    currentTopic: "",
    taskMode: "casual",
    openLoops: [],
    decisions: [],
    pinnedFacts: [],
    userSteering: [],
    doNotRepeat: [],
    references: createEmptyThreadReferenceState(),
    updatedAt: now
  };
}

export function toWireChatHarnessThreadState(
  state: SharedChatThreadState
): WireChatHarnessThreadState {
  const wire: WireChatHarnessThreadState = {
    recent_digest: state.recentDigest,
    active_goal: state.activeGoal,
    current_topic: state.currentTopic,
    task_mode: state.taskMode,
    open_loops: state.openLoops,
    decisions: state.decisions,
    pinned_facts: state.pinnedFacts,
    user_steering: state.userSteering,
    do_not_repeat: state.doNotRepeat,
    references: {
      last_options: state.references.lastOptions
    },
    updated_at: state.updatedAt
  };

  if (state.references.lastCodeBlock) {
    wire.references.last_code_block = {
      language: state.references.lastCodeBlock.language,
      code: state.references.lastCodeBlock.code,
      ...(state.references.lastCodeBlock.purpose
        ? { purpose: state.references.lastCodeBlock.purpose }
        : {})
    };
  }
  if (state.references.lastPlan) {
    wire.references.last_plan = state.references.lastPlan;
  }
  if (state.references.lastNamedThing) {
    wire.references.last_named_thing = state.references.lastNamedThing;
  }
  if (state.references.likelyReference) {
    wire.references.likely_reference = state.references.likelyReference;
  }

  return wire;
}
