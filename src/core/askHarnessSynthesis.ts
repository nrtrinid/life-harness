import type { ChatThreadItem, ContextExportMode } from "../components/askHarness/types";
import { buildConversationHistoryFromThread } from "./askHarnessThreadAdapter";
import {
  applyLikelyReferenceForSend,
  CHAT_HARNESS_MAX_HISTORY_CHARS,
  packConversationHistoryForGateway,
  toWireChatHarnessThreadState,
  type SharedChatThreadState
} from "./chatThreadState";
import { buildAiContextPacket } from "./contextPacketBuilder";
import { resolveSendBundleFromPacket } from "./contextPacketShim";
import { toWireContextPacket } from "./contextPacketWire";
import type { DeepSynthesisRequestInput, SynthesisLens } from "./deepSynthesisTypes";
import type { ChatHarnessMode, HarnessExportInput } from "./harnessContext";
import type { SensitivityLevel } from "./types";

const SYNTHESIS_USER_PROMPT_BASE =
  "Synthesize this Ask Harness conversation into a structured report. Focus on what we are circling, the strongest idea, hidden risk, connections, and one next pounce.";

const DEFAULT_INTERPRETATION_LENSES: SynthesisLens[] = ["practical", "emotional", "product"];

export type AskThreadFingerprint = {
  threadLength: number;
  lastItemId: string | null;
  lastItemRole: "user" | "assistant" | null;
  lastUserMessageLength: number;
  lastAssistantAnswerLength: number;
  digestSnippet: string;
};

export type BuildAskDeepSynthesisRequestArgs = {
  thread: ChatThreadItem[];
  threadState: SharedChatThreadState;
  exportInput: HarnessExportInput;
  contextMode: ContextExportMode;
  sensitivity: SensitivityLevel;
  mode?: ChatHarnessMode;
  pipelineProfile?: DeepSynthesisRequestInput["pipelineProfile"];
};

function countUserTurns(thread: ChatThreadItem[]): number {
  return thread.filter((item) => item.kind === "user").length;
}

function hasAssistantAnswer(thread: ChatThreadItem[]): boolean {
  return thread.some(
    (item) => item.kind === "assistant" && item.response.answer.trim().length > 0
  );
}

function conversationHistoryCharCount(thread: ChatThreadItem[]): number {
  return buildConversationHistoryFromThread(thread).reduce(
    (total, turn) => total + turn.content.length,
    0
  );
}

function findLastUserMessage(thread: ChatThreadItem[]): string {
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const item = thread[index];
    if (item?.kind === "user") {
      return item.text.trim();
    }
  }
  return "";
}

function resolveMode(thread: ChatThreadItem[], mode?: ChatHarnessMode): ChatHarnessMode {
  if (mode) {
    return mode;
  }
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const item = thread[index];
    if (item?.kind === "user") {
      return item.mode;
    }
  }
  return "general";
}

function findLastAssistantAnswerLength(thread: ChatThreadItem[]): number {
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const item = thread[index];
    if (item?.kind === "assistant") {
      return item.response.answer.trim().length;
    }
  }
  return 0;
}

function findLastUserMessageLength(thread: ChatThreadItem[]): number {
  return findLastUserMessage(thread).length;
}

export function isAskThreadEligibleForSynthesis(
  thread: ChatThreadItem[],
  threadState: SharedChatThreadState,
  sensitivity: SensitivityLevel
): boolean {
  if (sensitivity === "S3") {
    return false;
  }
  if (thread.length === 0) {
    return false;
  }
  if (!hasAssistantAnswer(thread)) {
    return false;
  }

  const digestLength = threadState.recentDigest.trim().length;
  return (
    countUserTurns(thread) >= 2 ||
    conversationHistoryCharCount(thread) >= 200 ||
    digestLength >= 40
  );
}

export function buildAskSynthesisUserPrompt(
  thread: ChatThreadItem[],
  threadState: SharedChatThreadState
): string {
  const parts = [SYNTHESIS_USER_PROMPT_BASE];
  const lastUserMessage = findLastUserMessage(thread);
  if (lastUserMessage) {
    parts.push(`Last user message: ${lastUserMessage}`);
  }
  const digest = threadState.recentDigest.trim();
  if (digest) {
    parts.push(`Recent thread digest: ${digest}`);
  }
  return parts.join("\n\n");
}

export function buildAskDeepSynthesisRequest(
  args: BuildAskDeepSynthesisRequestArgs
): DeepSynthesisRequestInput {
  const lastUserMessage = findLastUserMessage(args.thread);
  const mode = resolveMode(args.thread, args.mode);
  const threadStateForSend = applyLikelyReferenceForSend(args.threadState, lastUserMessage);
  const baseTurns = buildConversationHistoryFromThread(args.thread);
  const packedTurns = packConversationHistoryForGateway({
    turns: baseTurns,
    state: threadStateForSend,
    latestMessage: lastUserMessage,
    maxChars: CHAT_HARNESS_MAX_HISTORY_CHARS
  });
  const wireThreadState = toWireChatHarnessThreadState(threadStateForSend);
  const threadStateJsonChars = JSON.stringify(wireThreadState).length;
  const sendPacket = buildAiContextPacket({
    data: args.exportInput,
    userIntent: {
      message: lastUserMessage,
      mode,
      sensitivity: args.sensitivity
    },
    threadState: threadStateForSend,
    preferredExport: args.contextMode
  });
  const { context, conversationHistory: historyForSend } = resolveSendBundleFromPacket(
    sendPacket,
    {
      message: lastUserMessage,
      conversationHistory: packedTurns,
      threadStateJsonChars
    }
  );

  return {
    trigger: "thread_excerpt",
    sensitivity: args.sensitivity,
    userPrompt: buildAskSynthesisUserPrompt(args.thread, args.threadState),
    context,
    contextPacket: toWireContextPacket(sendPacket),
    conversationHistory: historyForSend,
    threadState: wireThreadState,
    pipelineProfile: args.pipelineProfile ?? "with_critic",
    interpretationLenses: DEFAULT_INTERPRETATION_LENSES
  };
}

export function buildAskThreadFingerprint(
  thread: ChatThreadItem[],
  threadState: SharedChatThreadState
): AskThreadFingerprint {
  const lastItem = thread.length > 0 ? thread[thread.length - 1] : null;
  const digestSnippet = threadState.recentDigest.trim().slice(0, 80);

  return {
    threadLength: thread.length,
    lastItemId: lastItem?.id ?? null,
    lastItemRole:
      lastItem?.kind === "user" || lastItem?.kind === "assistant" ? lastItem.kind : null,
    lastUserMessageLength: findLastUserMessageLength(thread),
    lastAssistantAnswerLength: findLastAssistantAnswerLength(thread),
    digestSnippet
  };
}

export function fingerprintToKey(fingerprint: AskThreadFingerprint): string {
  return JSON.stringify(fingerprint);
}

export function isSynthesisResultStale(
  current: AskThreadFingerprint,
  request: AskThreadFingerprint
): boolean {
  return fingerprintToKey(current) !== fingerprintToKey(request);
}
