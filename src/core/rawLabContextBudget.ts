import {
  compactCompanionSelfMemoriesForPrompt,
  toCompanionSelfMemoryWireList,
  type CompanionSelfMemory,
  type CompanionSelfMemoryForWire
} from "./companionSelfMemory";
import { DEFAULT_RAW_LAB_MAX_INPUT_CHARS } from "./gatewayBudget";
import {
  compactText,
  createEmptyRawLabThreadState,
  createEmptyRawLabSmartCompactedContext,
  toWireThreadState,
  toWireTurns,
  trimRawLabRecentTurns,
  type RawLabSmartCompactedContext,
  type RawLabThreadState,
  type RawLabTurn,
  type RawLabWireTurn
} from "./rawLabThreadState";

export type RawLabBudgetLevel =
  | "none"
  | "trim_history"
  | "compact_state"
  | "aggressive";

export type RawLabCompactionNotice = {
  level: RawLabBudgetLevel;
  message: string;
  beforeChars: number;
  afterChars: number;
  turnsBefore: number;
  turnsAfter: number;
};

export type RawLabSendBundle = {
  message: string;
  recentTurns: RawLabTurn[];
  threadState: RawLabThreadState;
  companionSelfMemories: CompanionSelfMemoryForWire[];
  notice?: RawLabCompactionNotice;
  estimatedChars: number;
  level: RawLabBudgetLevel;
  smartCompactedContext: RawLabSmartCompactedContext;
};

export const RAW_LAB_PROMPT_SHELL_CHARS = 7500;
export const RAW_LAB_SEND_BUDGET_SAFETY_MARGIN = 800;
export const RAW_LAB_INPUT_OVERHEAD_CHARS = 128;
export const RAW_LAB_MIN_RECENT_TURNS = 4;
export const RAW_LAB_NORMAL_RECENT_TURNS = 20;
export const RAW_LAB_COMPACT_RECENT_TURNS = 10;
export const RAW_LAB_AGGRESSIVE_RECENT_TURNS = 6;

const COMPACTION_NOTICE_MESSAGE =
  "Older Raw Lab thread memory was compacted to fit the local model budget.";

const EMPTY_WIRE_STATE_JSON_LEN = JSON.stringify(
  toWireThreadState(createEmptyRawLabThreadState())
).length;

function sumTurnContentChars(turns: RawLabWireTurn[]): number {
  return turns.reduce((total, turn) => total + turn.content.length, 0);
}

export function estimateRawLabSerializedInputChars(args: {
  message: string;
  recentTurns: RawLabTurn[];
  threadState: RawLabThreadState;
  companionSelfMemories?: CompanionSelfMemoryForWire[];
  estimatedSystemPromptChars?: number;
}): number {
  const wireTurns = toWireTurns(args.recentTurns);
  const wireState = toWireThreadState(args.threadState);
  const stateJsonLen = JSON.stringify(wireState).length;
  const stateDelta = Math.max(0, stateJsonLen - EMPTY_WIRE_STATE_JSON_LEN);
  const memoriesJsonLen = JSON.stringify(args.companionSelfMemories ?? []).length;
  const shell = args.estimatedSystemPromptChars ?? RAW_LAB_PROMPT_SHELL_CHARS;

  return (
    shell +
    stateDelta +
    memoriesJsonLen +
    sumTurnContentChars(wireTurns) +
    args.message.length +
    RAW_LAB_INPUT_OVERHEAD_CHARS
  );
}

function sliceList<T>(list: T[], max: number): T[] {
  return list.slice(0, max);
}

function sliceLatestList<T>(list: T[], max: number): T[] {
  if (max <= 0) {
    return [];
  }
  return list.slice(-max);
}

function truncateCodeBlock(
  state: RawLabThreadState,
  maxCodeChars: number
): RawLabThreadState {
  const codeBlock = state.references.lastCodeBlock;
  if (!codeBlock || codeBlock.code.length <= maxCodeChars) {
    return state;
  }
  return {
    ...state,
    references: {
      ...state.references,
      lastCodeBlock: {
        ...codeBlock,
        code: compactText(codeBlock.code, maxCodeChars)
      }
    }
  };
}

function hasSmartCompactedContext(context: RawLabSmartCompactedContext): boolean {
  return (
    context.activeOpenLoops.length > 0 ||
    context.questionsToRevisit.length > 0 ||
    context.userSteering.length > 0 ||
    context.doNotRepeat.length > 0 ||
    context.recurringTopics.length > 0 ||
    context.provisionalStances.length > 0 ||
    context.selfObservations.length > 0 ||
    context.importantRecentMoments.length > 0 ||
    Boolean(context.currentTension) ||
    Boolean(context.discardedNoiseSummary)
  );
}

function detectCurrentTension(turns: RawLabTurn[], state: RawLabThreadState): string {
  const recentUserText = turns
    .filter((turn) => turn.role === "user")
    .slice(-4)
    .map((turn) => turn.content)
    .join(" ")
    .toLowerCase();

  if (/\bavoid|avoiding|stuck|pushback|call me out\b/.test(recentUserText)) {
    return "The live tension is whether the user is building directly or circling avoidance.";
  }
  if (/\bhang out|chill|just talk|no productivity\b/.test(recentUserText)) {
    return "The live tension is staying present without turning the chat into productivity advice.";
  }
  if (/\bentity|personality|conscious|alive|selfhood\b/.test(recentUserText)) {
    return "The live tension is making Raw Lab feel coherent without implying consciousness or durable selfhood.";
  }
  if (state.openLoops.length > 0 || state.questionsToRevisit.length > 0) {
    return "The live tension is carrying forward the unresolved thread instead of resetting.";
  }
  return "";
}

function importantRecentMoments(turns: RawLabTurn[], maxItems: number): string[] {
  const patterns = [
    /\bdon(?:'|')?t\b/i,
    /\bstop\b/i,
    /\bactually\b/i,
    /\btrying to build\b/i,
    /\bavoid/i,
    /\bpushback\b/i,
    /\bhang out\b/i,
    /\bwhat were we circling\b/i,
    /\bremember\b/i,
    /\?$/
  ];
  return turns
    .filter((turn) => turn.role === "user")
    .filter((turn) => patterns.some((pattern) => pattern.test(turn.content.trim())))
    .slice(-maxItems)
    .map((turn) => compactText(`user: ${turn.content}`, 160));
}

export function buildRawLabSmartCompactedContext(args: {
  state: RawLabThreadState;
  turns: RawLabTurn[];
  level: Exclude<RawLabBudgetLevel, "none" | "trim_history">;
  turnsBefore: number;
}): RawLabSmartCompactedContext {
  const isAggressive = args.level === "aggressive";
  const activeOpenLoops = sliceList(args.state.openLoops, isAggressive ? 2 : 4);
  const questionsToRevisit = sliceList(
    args.state.questionsToRevisit,
    isAggressive ? 2 : 3
  );
  const userSteering = sliceLatestList(args.state.userSteering, isAggressive ? 2 : 4);
  const doNotRepeat = sliceLatestList(args.state.doNotRepeat, isAggressive ? 2 : 3);
  const moments = importantRecentMoments(args.turns, isAggressive ? 2 : 3);
  const sourceTurnIds = args.turns
    .filter((turn) => turn.role === "user")
    .filter((turn) =>
      moments.some((moment) => moment.includes(turn.content.trim().slice(0, 24)))
    )
    .map((turn) => turn.id)
    .filter(Boolean)
    .slice(-moments.length);

  const context: RawLabSmartCompactedContext = {
    activeOpenLoops,
    questionsToRevisit,
    userSteering,
    doNotRepeat,
    recurringTopics: sliceList(args.state.recurringTopics, isAggressive ? 2 : 3),
    provisionalStances: sliceList(args.state.provisionalStances, isAggressive ? 1 : 2),
    selfObservations: sliceList(args.state.selfObservations, isAggressive ? 1 : 2),
    importantRecentMoments: moments,
    currentTension: compactText(detectCurrentTension(args.turns, args.state), 180),
    discardedNoiseSummary:
      args.turnsBefore > args.turns.length
        ? compactText(
            `${args.turnsBefore - args.turns.length} older Raw Lab turns were dropped; lower-priority style flavor and repeated summaries should not dominate this reply.`,
            220
          )
        : "",
    sourceTurnIds,
    confidence:
      activeOpenLoops.length + questionsToRevisit.length + userSteering.length + doNotRepeat.length >
      0
        ? 0.8
        : moments.length > 0
          ? 0.65
          : 0.35
  };

  return hasSmartCompactedContext(context) ? context : createEmptyRawLabSmartCompactedContext();
}

export function compactRawLabThreadStateForBudget(args: {
  state: RawLabThreadState;
  level: Exclude<RawLabBudgetLevel, "none" | "trim_history">;
  turns?: RawLabTurn[];
  turnsBefore?: number;
}): RawLabThreadState {
  const { state, level } = args;
  const isAggressive = level === "aggressive";

  const digestMax = isAggressive ? 240 : 400;
  const goalTopicMax = isAggressive ? 120 : 220;
  const stanceMax = isAggressive ? 120 : 180;
  const vibeMax = isAggressive ? 90 : 140;

  let next: RawLabThreadState = {
    ...state,
    recentDigest: compactText(state.recentDigest, digestMax),
    activeGoal: compactText(state.activeGoal, goalTopicMax),
    currentTopic: compactText(state.currentTopic, goalTopicMax),
    openLoops: sliceList(state.openLoops, isAggressive ? 2 : 4),
    decisions: sliceList(state.decisions, isAggressive ? 2 : 4),
    pinnedFacts: sliceList(state.pinnedFacts, isAggressive ? 2 : 4),
    userSteering: sliceLatestList(state.userSteering, isAggressive ? 2 : 4),
    doNotRepeat: sliceLatestList(state.doNotRepeat, isAggressive ? 2 : 3),
    recurringTopics: sliceList(state.recurringTopics, isAggressive ? 2 : 4),
    currentVibe: compactText(state.currentVibe, vibeMax),
    provisionalStances: sliceList(state.provisionalStances, isAggressive ? 1 : 3),
    selfObservations: sliceList(state.selfObservations, isAggressive ? 1 : 3),
    questionsToRevisit: sliceList(state.questionsToRevisit, isAggressive ? 2 : 3),
    smartCompactedContext: buildRawLabSmartCompactedContext({
      state,
      turns: args.turns ?? [],
      level,
      turnsBefore: args.turnsBefore ?? args.turns?.length ?? 0
    }),
    references: {
      ...state.references,
      lastOptions: sliceList(state.references.lastOptions, isAggressive ? 2 : 4),
      lastPlan: state.references.lastPlan
        ? compactText(state.references.lastPlan, isAggressive ? 200 : 400)
        : undefined,
      lastNamedThing: state.references.lastNamedThing
        ? compactText(state.references.lastNamedThing, isAggressive ? 80 : 160)
        : undefined,
      likelyReference: state.references.likelyReference
        ? compactText(state.references.likelyReference, isAggressive ? 80 : 160)
        : undefined
    },
    personality: {
      ...state.personality,
      voiceTraits: sliceList(state.personality.voiceTraits, isAggressive ? 2 : 4),
      conversationalInstincts: sliceList(
        state.personality.conversationalInstincts,
        isAggressive ? 2 : 4
      ),
      recurringInterests: sliceList(state.personality.recurringInterests, isAggressive ? 2 : 4),
      userRespondsWellTo: sliceList(
        state.personality.userRespondsWellTo,
        isAggressive ? 1 : 3
      ),
      userDislikes: sliceList(state.personality.userDislikes, isAggressive ? 1 : 3),
      currentStance: compactText(state.personality.currentStance, stanceMax),
      growthNotes: sliceList(state.personality.growthNotes, isAggressive ? 1 : 2)
    }
  };

  next = truncateCodeBlock(next, isAggressive ? 600 : 1200);
  return next;
}

function trimTurnsForBudget(args: {
  turns: RawLabTurn[];
  message: string;
  threadState: RawLabThreadState;
  companionSelfMemories: CompanionSelfMemoryForWire[];
  maxInputChars: number;
  maxTurns: number;
}): RawLabTurn[] {
  let trimmed = args.turns.slice(-args.maxTurns);
  while (
    trimmed.length > 0 &&
    !fitsBudget({
      message: args.message,
      turns: trimmed,
      threadState: args.threadState,
      companionSelfMemories: args.companionSelfMemories,
      maxInputChars: args.maxInputChars
    })
  ) {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

function buildCandidate(args: {
  message: string;
  turns: RawLabTurn[];
  threadState: RawLabThreadState;
  companionSelfMemories: CompanionSelfMemory[];
  maxInputChars: number;
  maxTurns: number;
  stateLevel: RawLabBudgetLevel;
}): {
  turns: RawLabTurn[];
  threadState: RawLabThreadState;
  companionSelfMemories: CompanionSelfMemoryForWire[];
  level: RawLabBudgetLevel;
} {
  let threadState = args.threadState;
  if (args.stateLevel === "compact_state") {
    threadState = compactRawLabThreadStateForBudget({
      state: args.threadState,
      level: "compact_state",
      turns: args.turns,
      turnsBefore: args.turns.length
    });
  } else if (args.stateLevel === "aggressive") {
    threadState = compactRawLabThreadStateForBudget({
      state: args.threadState,
      level: "aggressive",
      turns: args.turns,
      turnsBefore: args.turns.length
    });
  }

  const memoryLevel =
    args.stateLevel === "none" || args.stateLevel === "trim_history"
      ? args.stateLevel
      : args.stateLevel;
  const compactedMemories = compactCompanionSelfMemoriesForPrompt({
    memories: args.companionSelfMemories,
    level: memoryLevel
  });
  const wireMemories = toCompanionSelfMemoryWireList(compactedMemories);

  const turns = trimTurnsForBudget({
    turns: args.turns,
    message: args.message,
    threadState,
    companionSelfMemories: wireMemories,
    maxInputChars: args.maxInputChars,
    maxTurns: args.maxTurns
  });

  if (args.stateLevel === "compact_state" || args.stateLevel === "aggressive") {
    threadState = {
      ...threadState,
      smartCompactedContext: buildRawLabSmartCompactedContext({
        state: threadState,
        turns,
        level: args.stateLevel,
        turnsBefore: args.turns.length
      })
    };
  }

  return { turns, threadState, companionSelfMemories: wireMemories, level: args.stateLevel };
}

function fitsBudget(args: {
  message: string;
  turns: RawLabTurn[];
  threadState: RawLabThreadState;
  companionSelfMemories: CompanionSelfMemoryForWire[];
  maxInputChars: number;
}): boolean {
  return (
    estimateRawLabSerializedInputChars({
      message: args.message,
      recentTurns: args.turns,
      threadState: args.threadState,
      companionSelfMemories: args.companionSelfMemories
    }) <= args.maxInputChars
  );
}

export function buildRawLabSendBundle(args: {
  message: string;
  turns: RawLabTurn[];
  threadState: RawLabThreadState;
  companionSelfMemories?: CompanionSelfMemory[];
  maxInputChars?: number;
  forceAggressive?: boolean;
}): RawLabSendBundle {
  const message = args.message.trim();
  const maxInputChars = args.maxInputChars ?? DEFAULT_RAW_LAB_MAX_INPUT_CHARS;
  const sourceMemories = args.companionSelfMemories ?? [];
  const turnsBefore = args.turns.length;
  const beforeChars = estimateRawLabSerializedInputChars({
    message,
    recentTurns: trimRawLabRecentTurns(args.turns, {
      maxTurns: RAW_LAB_NORMAL_RECENT_TURNS,
      messageChars: message.length
    }),
    threadState: args.threadState,
    companionSelfMemories: toCompanionSelfMemoryWireList(
      compactCompanionSelfMemoriesForPrompt({
        memories: sourceMemories,
        level: "none"
      })
    )
  });

  if (args.forceAggressive) {
    const forced = buildCandidate({
      message,
      turns: args.turns,
      threadState: args.threadState,
      companionSelfMemories: sourceMemories,
      maxInputChars,
      maxTurns: RAW_LAB_MIN_RECENT_TURNS,
      stateLevel: "aggressive"
    });
    const afterChars = estimateRawLabSerializedInputChars({
      message,
      recentTurns: forced.turns,
      threadState: forced.threadState,
      companionSelfMemories: forced.companionSelfMemories
    });
    return {
      message,
      recentTurns: forced.turns,
      threadState: forced.threadState,
      companionSelfMemories: forced.companionSelfMemories,
      estimatedChars: afterChars,
      level: "aggressive",
      smartCompactedContext: forced.threadState.smartCompactedContext,
      notice: {
        level: "aggressive",
        message: COMPACTION_NOTICE_MESSAGE,
        beforeChars,
        afterChars,
        turnsBefore,
        turnsAfter: forced.turns.length
      }
    };
  }

  const stages: Array<{
    maxTurns: number;
    stateLevel: RawLabBudgetLevel;
    level: RawLabBudgetLevel;
  }> = [
    { maxTurns: RAW_LAB_NORMAL_RECENT_TURNS, stateLevel: "none", level: "none" },
    { maxTurns: RAW_LAB_COMPACT_RECENT_TURNS, stateLevel: "none", level: "trim_history" },
    { maxTurns: RAW_LAB_COMPACT_RECENT_TURNS, stateLevel: "compact_state", level: "compact_state" },
    {
      maxTurns: RAW_LAB_AGGRESSIVE_RECENT_TURNS,
      stateLevel: "aggressive",
      level: "aggressive"
    },
    {
      maxTurns: RAW_LAB_MIN_RECENT_TURNS,
      stateLevel: "aggressive",
      level: "aggressive"
    }
  ];

  let best = buildCandidate({
    message,
    turns: args.turns,
    threadState: args.threadState,
    companionSelfMemories: sourceMemories,
    maxInputChars,
    maxTurns: RAW_LAB_NORMAL_RECENT_TURNS,
    stateLevel: "none"
  });
  let bestLevel: RawLabBudgetLevel = "none";

  for (const stage of stages) {
    const candidate = buildCandidate({
      message,
      turns: args.turns,
      threadState: args.threadState,
      companionSelfMemories: sourceMemories,
      maxInputChars,
      maxTurns: stage.maxTurns,
      stateLevel: stage.stateLevel
    });
    best = candidate;
    bestLevel = stage.level;
    if (
      fitsBudget({
        message,
        turns: candidate.turns,
        threadState: candidate.threadState,
        companionSelfMemories: candidate.companionSelfMemories,
        maxInputChars
      })
    ) {
      break;
    }
  }

  const afterChars = estimateRawLabSerializedInputChars({
    message,
    recentTurns: best.turns,
    threadState: best.threadState,
    companionSelfMemories: best.companionSelfMemories
  });

  const result: RawLabSendBundle = {
    message,
    recentTurns: best.turns,
    threadState: best.threadState,
    companionSelfMemories: best.companionSelfMemories,
    estimatedChars: afterChars,
    level: bestLevel,
    smartCompactedContext: best.threadState.smartCompactedContext
  };

  if (bestLevel !== "none" || best.turns.length < turnsBefore) {
    result.notice = {
      level: bestLevel === "none" ? "trim_history" : bestLevel,
      message: COMPACTION_NOTICE_MESSAGE,
      beforeChars,
      afterChars,
      turnsBefore,
      turnsAfter: best.turns.length
    };
  }

  return result;
}

export function isRawLabInputBudgetError(detail: string | undefined): boolean {
  if (!detail) {
    return false;
  }
  return (
    detail.includes("SCOUT_MAX_INPUT_CHARS") ||
    detail.includes("SCOUT_RAW_LAB_MAX_INPUT_CHARS") ||
    detail.includes("Serialized input length") ||
    detail.includes("Serialized prompt length")
  );
}
