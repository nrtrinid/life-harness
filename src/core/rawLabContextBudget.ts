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
  toWireThreadState,
  toWireTurns,
  trimRawLabRecentTurns,
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

export function compactRawLabThreadStateForBudget(args: {
  state: RawLabThreadState;
  level: Exclude<RawLabBudgetLevel, "none" | "trim_history">;
}): RawLabThreadState {
  const { state, level } = args;
  const isAggressive = level === "aggressive";

  const digestMax = isAggressive ? 240 : 400;
  const goalTopicMax = isAggressive ? 120 : 220;
  const stanceMax = isAggressive ? 120 : 180;

  let next: RawLabThreadState = {
    ...state,
    recentDigest: compactText(state.recentDigest, digestMax),
    activeGoal: compactText(state.activeGoal, goalTopicMax),
    currentTopic: compactText(state.currentTopic, goalTopicMax),
    openLoops: sliceList(state.openLoops, isAggressive ? 2 : 4),
    decisions: sliceList(state.decisions, isAggressive ? 2 : 4),
    pinnedFacts: sliceList(state.pinnedFacts, isAggressive ? 2 : 4),
    userSteering: sliceList(state.userSteering, isAggressive ? 2 : 4),
    doNotRepeat: sliceList(state.doNotRepeat, isAggressive ? 2 : 3),
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
      level: "compact_state"
    });
  } else if (args.stateLevel === "aggressive") {
    threadState = compactRawLabThreadStateForBudget({
      state: args.threadState,
      level: "aggressive"
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
    level: bestLevel
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
