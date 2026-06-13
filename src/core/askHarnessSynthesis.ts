import type { ChatThreadItem, ContextExportMode } from "../components/askHarness/types";
import { buildConversationHistoryFromThread } from "./askHarnessThreadAdapter";
import { buildChatHarnessSendBundle } from "./chatHarnessSendBudget";
import type { ReasoningDepth } from "./chatHarnessClient";
import { type SharedChatThreadState } from "./chatThreadState";
import { buildAiContextPacket } from "./contextPacketBuilder";
import { resolveTrustedUserMessage } from "./untrustedContextBlock";
import { toWireContextPacket } from "./contextPacketWire";
import { DEFAULT_GATEWAY_MAX_INPUT_CHARS } from "./gatewayBudget";
import type {
  DeepSynthesisCompletedResult,
  DeepSynthesisRequestInput,
  SynthesisLens,
} from "./deepSynthesisTypes";
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
  reasoningDepth?: ReasoningDepth;
  maxPromptChars?: number;
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
  const sendPacket = buildAiContextPacket({
    data: args.exportInput,
    route: "deep_synthesis",
    userIntent: {
      message: lastUserMessage,
      mode,
      sensitivity: args.sensitivity
    },
    threadState: args.threadState,
    preferredExport: args.contextMode
  });
  const synthesisMessage =
    sendPacket.untrustedBlocks?.length && sendPacket.routing
      ? resolveTrustedUserMessage(lastUserMessage, sendPacket.routing, sendPacket.untrustedBlocks)
      : lastUserMessage;
  const sendBundle = buildChatHarnessSendBundle({
    exportInput: args.exportInput,
    message: synthesisMessage,
    priorThread: args.thread,
    threadState: args.threadState,
    preferredContextMode: args.contextMode,
    reasoningDepth: args.reasoningDepth,
    maxPromptChars: args.maxPromptChars ?? DEFAULT_GATEWAY_MAX_INPUT_CHARS,
    buildPacket: () => sendPacket
  });

  return {
    trigger: "thread_excerpt",
    sensitivity: args.sensitivity,
    userPrompt: buildAskSynthesisUserPrompt(args.thread, args.threadState),
    context: sendBundle.context,
    contextPacket: toWireContextPacket(sendPacket),
    conversationHistory: sendBundle.conversationHistory,
    threadState: sendBundle.wireThreadState,
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

export function buildSynthesisReportPlainText(result: DeepSynthesisCompletedResult): string {
  const lines: string[] = [
    "Deep synthesis",
    "",
    "What we're circling",
    result.circling,
    "",
    "Strongest idea",
    result.strongestIdea,
    "",
    "Hidden risk",
    result.hiddenRisk,
  ];

  if (result.connections.length > 0) {
    lines.push("", "Connections", ...result.connections.map((item) => `- ${item}`));
  }

  lines.push(
    "",
    result.nextPounce.title,
    result.nextPounce.smallestAction
  );
  if (result.nextPounce.cardHint?.trim()) {
    lines.push(result.nextPounce.cardHint.trim());
  }

  return lines.join("\n");
}

export function canCopyTextToClipboard(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.clipboard) &&
    typeof navigator.clipboard.writeText === "function"
  );
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!canCopyTextToClipboard()) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
