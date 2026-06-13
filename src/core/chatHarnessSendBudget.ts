import type { ChatThreadItem } from "./chatHarnessTypes";
import { buildConversationHistoryFromThread } from "./askHarnessThreadAdapter";
import type { ReasoningDepth } from "./chatHarnessClient";
import {
  applyLikelyReferenceForSend,
  CHAT_HARNESS_MAX_HISTORY_CHARS,
  CHAT_HARNESS_MAX_HISTORY_TURNS,
  compactSharedChatThreadStateForSendBudget,
  packConversationHistoryForGateway,
  toWireChatHarnessThreadState,
  type SharedChatThreadState
} from "./chatThreadState";
import type { AiContextPacket } from "./contextPacket";
import { applyPacketBudget } from "./contextPacketRanking";
import { packetToHarnessContext } from "./contextPacketShim";
import {
  buildCompactHarnessContext,
  buildHarnessContext,
  CHAT_HARNESS_PROMPT_SHELL_CHARS,
  type ConversationTurn,
  type HarnessContext,
  type HarnessExportInput
} from "./harnessContext";

export const CHAT_HARNESS_FORMAT_OVERHEAD_CHARS = 32;

export const CHAT_HARNESS_SEND_HISTORY_COMPACT_TURNS = 4;
export const CHAT_HARNESS_SEND_HISTORY_COMPACT_CHARS = 2500;
export const CHAT_HARNESS_SEND_HISTORY_MINIMAL_TURNS = 2;
export const CHAT_HARNESS_SEND_HISTORY_MINIMAL_CHARS = 800;

export type ChatHarnessSendCompactionLevel =
  | "trim_history"
  | "compact_thread_state"
  | "compact_context"
  | "minimal";

export type ChatHarnessSendBundle = {
  context: HarnessContext;
  conversationHistory: ConversationTurn[];
  threadState: SharedChatThreadState;
  wireThreadState: ReturnType<typeof toWireChatHarnessThreadState>;
  contextMode: "full" | "compact";
  estimatedChars: number;
  fits: boolean;
  notice?: {
    level: ChatHarnessSendCompactionLevel;
    message: string;
    beforeChars: number;
    afterChars: number;
  };
};

export type BuildChatHarnessSendBundleArgs = {
  exportInput: HarnessExportInput;
  message: string;
  priorThread: ChatThreadItem[];
  threadState: SharedChatThreadState;
  preferredContextMode: "full" | "compact";
  reasoningDepth?: ReasoningDepth;
  maxPromptChars: number;
  buildPacket?: () => AiContextPacket;
};

const REASONING_DEPTH_SUFFIXES: Record<ReasoningDepth, string> = {
  fast: "Answer directly and concisely.",
  deliberate:
    "Before answering, privately check the user's goal, relevant board facts, thread context, missing info, and repetition risk. Return only the final JSON.",
  deep: "Use careful reasoning before answering. Return only the final JSON answer."
};

function reasoningDepthSuffixChars(depth: ReasoningDepth = "fast"): number {
  return REASONING_DEPTH_SUFFIXES[depth].length;
}

function cloneThreadState(state: SharedChatThreadState): SharedChatThreadState {
  return structuredClone(state);
}

function wireThreadStateJsonChars(state: SharedChatThreadState): number {
  return JSON.stringify(toWireChatHarnessThreadState(state), null, 2).length;
}

export function estimateChatHarnessSendPromptChars(args: {
  context: HarnessContext;
  message: string;
  conversationHistory: ConversationTurn[];
  threadState: SharedChatThreadState;
  reasoningDepth?: ReasoningDepth;
}): number {
  const reasoningDepth = args.reasoningDepth ?? "fast";
  return (
    CHAT_HARNESS_PROMPT_SHELL_CHARS +
    JSON.stringify(args.context, null, 2).length +
    args.message.length +
    JSON.stringify(args.conversationHistory, null, 2).length +
    wireThreadStateJsonChars(args.threadState) +
    reasoningDepthSuffixChars(reasoningDepth) +
    CHAT_HARNESS_FORMAT_OVERHEAD_CHARS
  );
}

function buildInitialContext(args: {
  exportInput: HarnessExportInput;
  message: string;
  conversationHistory: ConversationTurn[];
  preferredContextMode: "full" | "compact";
  buildPacket?: () => AiContextPacket;
}): { context: HarnessContext; contextMode: "full" | "compact" } {
  if (args.buildPacket) {
    const packet = applyPacketBudget(args.buildPacket());
    return {
      context: packetToHarnessContext(packet),
      contextMode: args.preferredContextMode
    };
  }

  if (args.preferredContextMode === "compact") {
    return {
      context: buildCompactHarnessContext(args.exportInput),
      contextMode: "compact"
    };
  }

  return {
    context: buildHarnessContext(args.exportInput),
    contextMode: "full"
  };
}

function remainingContextPromptBudget(args: {
  maxPromptChars: number;
  message: string;
  conversationHistory: ConversationTurn[];
  threadState: SharedChatThreadState;
  reasoningDepth?: ReasoningDepth;
}): number {
  const fixed =
    CHAT_HARNESS_PROMPT_SHELL_CHARS +
    args.message.length +
    JSON.stringify(args.conversationHistory, null, 2).length +
    wireThreadStateJsonChars(args.threadState) +
    reasoningDepthSuffixChars(args.reasoningDepth) +
    CHAT_HARNESS_FORMAT_OVERHEAD_CHARS;
  return Math.max(1500, args.maxPromptChars - fixed);
}

function buildCompactContextForSend(args: {
  exportInput: HarnessExportInput;
  message: string;
  conversationHistory: ConversationTurn[];
  threadState: SharedChatThreadState;
  reasoningDepth?: ReasoningDepth;
  maxPromptChars: number;
  buildPacket?: () => AiContextPacket;
}): HarnessContext {
  const contextBudget = remainingContextPromptBudget(args);
  if (args.buildPacket) {
    const packet = applyPacketBudget(args.buildPacket(), { maxChars: contextBudget });
    return packetToHarnessContext(packet);
  }
  return buildCompactHarnessContext(args.exportInput, { maxPromptChars: contextBudget });
}

function buildHistoryForStage(
  priorThread: ChatThreadItem[],
  threadState: SharedChatThreadState,
  message: string,
  maxTurns: number,
  maxChars: number
): ConversationTurn[] {
  const baseTurns = buildConversationHistoryFromThread(priorThread, { maxTurns, maxChars });
  return packConversationHistoryForGateway({
    turns: baseTurns,
    state: threadState,
    latestMessage: message,
    maxChars,
    alwaysIncludeRecentTurns: maxTurns
  });
}

function trimOldestHistoryUntilFits(
  history: ConversationTurn[],
  fits: () => boolean
): ConversationTurn[] {
  let trimmed = [...history];
  while (trimmed.length > 0 && !fits()) {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

function finalizeBundle(args: {
  context: HarnessContext;
  conversationHistory: ConversationTurn[];
  threadState: SharedChatThreadState;
  contextMode: "full" | "compact";
  message: string;
  reasoningDepth?: ReasoningDepth;
  maxPromptChars: number;
  notice?: ChatHarnessSendBundle["notice"];
}): ChatHarnessSendBundle {
  const estimatedChars = estimateChatHarnessSendPromptChars({
    context: args.context,
    message: args.message,
    conversationHistory: args.conversationHistory,
    threadState: args.threadState,
    reasoningDepth: args.reasoningDepth
  });
  const wireThreadState = toWireChatHarnessThreadState(args.threadState);
  return {
    context: args.context,
    conversationHistory: args.conversationHistory,
    threadState: args.threadState,
    wireThreadState,
    contextMode: args.contextMode,
    estimatedChars,
    fits: estimatedChars <= args.maxPromptChars,
    notice: args.notice
  };
}

const COMPACTION_NOTICE =
  "Older conversation context was compacted to fit the prompt budget.";

export function buildChatHarnessSendBundle(
  args: BuildChatHarnessSendBundleArgs
): ChatHarnessSendBundle {
  const message = args.message.trim();
  const reasoningDepth = args.reasoningDepth ?? "fast";
  const maxPromptChars = args.maxPromptChars;

  let threadStateForSend = cloneThreadState(
    applyLikelyReferenceForSend(args.threadState, message)
  );
  let conversationHistory = buildHistoryForStage(
    args.priorThread,
    threadStateForSend,
    message,
    CHAT_HARNESS_MAX_HISTORY_TURNS,
    CHAT_HARNESS_MAX_HISTORY_CHARS
  );

  let contextMode = args.preferredContextMode;
  let context = buildInitialContext({
    exportInput: args.exportInput,
    message,
    conversationHistory,
    preferredContextMode: args.preferredContextMode,
    buildPacket: args.buildPacket
  }).context;

  const estimateCurrent = () =>
    estimateChatHarnessSendPromptChars({
      context,
      message,
      conversationHistory,
      threadState: threadStateForSend,
      reasoningDepth
    });

  const beforeInitial = estimateCurrent();
  if (beforeInitial <= maxPromptChars) {
    return finalizeBundle({
      context,
      conversationHistory,
      threadState: threadStateForSend,
      contextMode,
      message,
      reasoningDepth,
      maxPromptChars
    });
  }

  let noticeBefore = beforeInitial;

  // Stage 1: trim_history
  conversationHistory = buildHistoryForStage(
    args.priorThread,
    threadStateForSend,
    message,
    CHAT_HARNESS_SEND_HISTORY_COMPACT_TURNS,
    CHAT_HARNESS_SEND_HISTORY_COMPACT_CHARS
  );
  conversationHistory = trimOldestHistoryUntilFits(conversationHistory, () =>
    estimateCurrent() <= maxPromptChars
  );

  if (estimateCurrent() <= maxPromptChars) {
    return finalizeBundle({
      context,
      conversationHistory,
      threadState: threadStateForSend,
      contextMode,
      message,
      reasoningDepth,
      maxPromptChars,
      notice: {
        level: "trim_history",
        message: COMPACTION_NOTICE,
        beforeChars: noticeBefore,
        afterChars: estimateCurrent()
      }
    });
  }

  // Stage 2: compact_thread_state
  threadStateForSend = compactSharedChatThreadStateForSendBudget(threadStateForSend, "compact");
  if (estimateCurrent() <= maxPromptChars) {
    return finalizeBundle({
      context,
      conversationHistory,
      threadState: threadStateForSend,
      contextMode,
      message,
      reasoningDepth,
      maxPromptChars,
      notice: {
        level: "compact_thread_state",
        message: COMPACTION_NOTICE,
        beforeChars: noticeBefore,
        afterChars: estimateCurrent()
      }
    });
  }

  // Stage 3: compact_context
  contextMode = "compact";
  context = buildCompactContextForSend({
    exportInput: args.exportInput,
    message,
    conversationHistory,
    threadState: threadStateForSend,
    reasoningDepth,
    maxPromptChars,
    buildPacket: args.buildPacket
  });
  if (estimateCurrent() <= maxPromptChars) {
    return finalizeBundle({
      context,
      conversationHistory,
      threadState: threadStateForSend,
      contextMode,
      message,
      reasoningDepth,
      maxPromptChars,
      notice: {
        level: "compact_context",
        message: COMPACTION_NOTICE,
        beforeChars: noticeBefore,
        afterChars: estimateCurrent()
      }
    });
  }

  // Stage 4: minimal
  conversationHistory = buildHistoryForStage(
    args.priorThread,
    threadStateForSend,
    message,
    CHAT_HARNESS_SEND_HISTORY_MINIMAL_TURNS,
    CHAT_HARNESS_SEND_HISTORY_MINIMAL_CHARS
  );
  conversationHistory = trimOldestHistoryUntilFits(conversationHistory, () =>
    estimateCurrent() <= maxPromptChars
  );
  threadStateForSend = compactSharedChatThreadStateForSendBudget(threadStateForSend, "minimal");
  context = buildCompactContextForSend({
    exportInput: args.exportInput,
    message,
    conversationHistory,
    threadState: threadStateForSend,
    reasoningDepth,
    maxPromptChars,
    buildPacket: args.buildPacket
  });

  const afterMinimal = estimateCurrent();
  return finalizeBundle({
    context,
    conversationHistory,
    threadState: threadStateForSend,
    contextMode,
    message,
    reasoningDepth,
    maxPromptChars,
    notice:
      afterMinimal <= maxPromptChars
        ? {
            level: "minimal",
            message: COMPACTION_NOTICE,
            beforeChars: noticeBefore,
            afterChars: afterMinimal
          }
        : undefined
  });
}
