import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";

import { AskHarnessAdvancedPanel } from "../src/components/askHarness/AskHarnessAdvancedPanel";
import { ChatComposer, type QuickQuestion } from "../src/components/askHarness/ChatComposer";
import { ChatThreadContextPanel } from "../src/components/askHarness/ChatThreadContextPanel";
import { ChatThread } from "../src/components/askHarness/ChatThread";
import { HarnessReadCard } from "../src/components/askHarness/HarnessReadCard";
import { SynthesisJobPanel } from "../src/components/askHarness/SynthesisJobPanel";
import { useDeepSynthesisJob } from "../src/components/askHarness/useDeepSynthesisJob";
import type { ChatThreadItem, ContextExportMode } from "../src/components/askHarness/types";
import { getChatSurfaceHeight } from "../src/components/chatSurfaceLayout";
import { PageHeader } from "../src/components/PageHeader";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { styles } from "../src/components/styles";
import {
  askChatHarness,
  ChatHarnessError,
  DEFAULT_CHAT_HARNESS_URL,
  type ReasoningDepth
} from "../src/core/chatHarnessClient";
import { buildConversationHistoryFromThread } from "../src/core/askHarnessThreadAdapter";
import {
  applyLikelyReferenceForSend,
  applyVariantPromptToThreadState,
  CHAT_HARNESS_MAX_HISTORY_CHARS,
  createEmptySharedChatThreadState,
  packConversationHistoryForGateway,
  toWireChatHarnessThreadState,
  updateSharedChatThreadStateAfterTurn,
  type ChatTurn,
  type SharedChatThreadState
} from "../src/core/chatThreadState";
import { buildAiContextPacket } from "../src/core/contextPacketBuilder";
import { formatPacketSliceSummary, resolveSendBundleFromPacket } from "../src/core/contextPacketShim";
import { toWireContextPacket } from "../src/core/contextPacketWire";
import {
  buildCompactHarnessContext,
  buildContextQualitySummary,
  buildHarnessContext,
  DEFAULT_GATEWAY_MAX_INPUT_CHARS,
  estimateChatHarnessPromptChars,
  estimateHarnessContextChars,
  getActiveLimitSignal,
  shouldAutoSelectCompactExport,
  type ChatHarnessMode,
  type HarnessExportInput
} from "../src/core/harnessContext";
import { createId } from "../src/core/ids";
import {
  createMemoryItem,
  memoryItemDedupeKey,
  sortMemoryItemsNewestFirst
} from "../src/core/harnessMemoryBank";
import type { HarnessChatSummary, HarnessMemoryItem, SensitivityLevel } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const QUICK_QUESTIONS: { label: string; message: string; mode: ChatHarnessMode }[] = [
  { label: "Avoiding?", message: "What am I avoiding right now?", mode: "operator" },
  { label: "Next?", message: "What should I do next?", mode: "operator" },
  { label: "Over-opt?", message: "Am I over-optimizing again?", mode: "reflection" },
  { label: "Build?", message: "What should I build next?", mode: "builder" },
  {
    label: "Blunt",
    message: "Give me blunt advice based on this context.",
    mode: "general"
  },
  {
    label: "Talk normally",
    message: "Can you just talk to me normally about this?",
    mode: "general"
  }
];

const JSON_PREVIEW_LIMIT = 4000;
const WIDE_LAYOUT_BREAKPOINT = 900;

function buildExportInput(state: ReturnType<typeof useLifeHarness>): HarnessExportInput {
  const input: HarnessExportInput = {
    cards: state.cards,
    logs: state.logs,
    proofItems: state.proofItems,
    dailyState: state.dailyState
  };

  if (state.resumeModules) {
    input.resumeModules = state.resumeModules;
  }
  if (state.jobCandidates) {
    input.jobCandidates = state.jobCandidates;
  }
  if (state.jobSourceRuns) {
    input.jobSourceRuns = state.jobSourceRuns;
  }
  if (state.chatSummaries) {
    input.chatSummaries = state.chatSummaries;
  }
  if (state.memoryItems) {
    input.memoryItems = state.memoryItems;
  }

  return input;
}

function formatSendError(error: unknown): { text: string; status?: number } {
  if (error instanceof ChatHarnessError) {
    return { text: error.message, status: error.status };
  }

  return {
    text: "Unexpected error while contacting Chat Harness. Check the gateway URL and try again."
  };
}

export default function AskHarnessDevScreen() {
  const { digest: digestParam } = useLocalSearchParams<{ digest?: string }>();
  const harnessState = useLifeHarness();
  const {
    saveChatSummary,
    deleteChatSummary,
    saveMemoryItem,
    deleteMemoryItem,
    toggleMemoryItemActive
  } = harnessState;
  const { width, height } = useWindowDimensions();
  const isWideLayout = width >= WIDE_LAYOUT_BREAKPOINT;
  const chatSurfaceHeight = getChatSurfaceHeight(height, "harness", isWideLayout);
  const threadScrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const [baseUrl, setBaseUrl] = useState(DEFAULT_CHAT_HARNESS_URL);
  const [mode, setMode] = useState<ChatHarnessMode>("general");
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>("S1");
  const [reasoningDepth, setReasoningDepth] = useState<ReasoningDepth>("fast");
  const [message, setMessage] = useState("");
  const [thread, setThread] = useState<ChatThreadItem[]>([]);
  const [threadState, setThreadState] = useState<SharedChatThreadState>(() =>
    createEmptySharedChatThreadState()
  );
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lastSentPacketSummary, setLastSentPacketSummary] = useState<string | null>(null);

  function buildInspectorPacket(
    userMessage: string,
    state: SharedChatThreadState,
    exportMode: ContextExportMode
  ) {
    return buildAiContextPacket({
      data: exportInput,
      userIntent: { message: userMessage, mode, sensitivity },
      threadState: state,
      preferredExport: exportMode
    });
  }

  function handleQuickQuestion(item: QuickQuestion) {
    setMessage(item.message);
    setMode(item.mode);
    if (Platform.OS === "web") {
      inputRef.current?.focus();
    }
  }

  useEffect(() => {
    setAdvancedOpen(isWideLayout);
  }, [isWideLayout]);

  useEffect(() => {
    const digest = typeof digestParam === "string" ? digestParam.trim() : "";
    if (!digest) {
      return;
    }
    setMessage(digest);
    setThread([]);
    setThreadState(createEmptySharedChatThreadState());
  }, [digestParam]);

  const exportInput = useMemo(() => buildExportInput(harnessState), [harnessState]);
  const fullContext = useMemo(() => buildHarnessContext(exportInput), [exportInput]);
  const compactContext = useMemo(() => buildCompactHarnessContext(exportInput), [exportInput]);
  const fullChars = useMemo(() => estimateHarnessContextChars(fullContext), [fullContext]);
  const compactChars = useMemo(() => estimateHarnessContextChars(compactContext), [compactContext]);
  const fullPromptChars = useMemo(
    () => estimateChatHarnessPromptChars(fullContext, { message }),
    [fullContext, message]
  );
  const compactPromptChars = useMemo(
    () => estimateChatHarnessPromptChars(compactContext, { message }),
    [compactContext, message]
  );
  const autoContextMode: ContextExportMode = shouldAutoSelectCompactExport(fullContext, message)
    ? "compact"
    : "full";
  const [contextModeOverride, setContextModeOverride] = useState<ContextExportMode | null>(null);
  const contextMode = contextModeOverride ?? autoContextMode;
  const selectedContext = contextMode === "compact" ? compactContext : fullContext;
  const selectedJsonChars = contextMode === "compact" ? compactChars : fullChars;
  const selectedPromptChars = contextMode === "compact" ? compactPromptChars : fullPromptChars;
  const promptOverBudget = selectedPromptChars > DEFAULT_GATEWAY_MAX_INPUT_CHARS;
  const activeLimitSignal = useMemo(() => getActiveLimitSignal(exportInput), [exportInput]);
  const activeMemoryCount = useMemo(
    () => harnessState.memoryItems.filter((item) => item.isActive).length,
    [harnessState.memoryItems]
  );
  const previewPacket = useMemo(
    () => buildInspectorPacket(message, threadState, contextMode),
    [exportInput, message, mode, sensitivity, threadState, contextMode]
  );
  const previewPacketSummary = useMemo(
    () => formatPacketSliceSummary(previewPacket),
    [previewPacket]
  );
  const packetSliceSummary = lastSentPacketSummary ?? previewPacketSummary;
  const synthesis = useDeepSynthesisJob({
    baseUrl,
    thread,
    threadState,
    exportInput,
    contextMode,
    sensitivity,
    mode
  });
  const showSynthesisAction = thread.length > 0;
  const synthesisDisabled =
    !synthesis.eligible || synthesis.synthesisBusy || sensitivity === "S3";
  const qualitySummary = useMemo(
    () =>
      buildContextQualitySummary(
        selectedContext,
        activeLimitSignal,
        harnessState.chatSummaries.length,
        harnessState.memoryItems.length,
        activeMemoryCount
      ),
    [
      selectedContext,
      activeLimitSignal,
      harnessState.chatSummaries.length,
      harnessState.memoryItems.length,
      activeMemoryCount
    ]
  );
  const recentMemories = useMemo(
    () =>
      [...harnessState.chatSummaries]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 3),
    [harnessState.chatSummaries]
  );
  const recentMemoryBankItems = useMemo(
    () => sortMemoryItemsNewestFirst(harnessState.memoryItems).slice(0, 5),
    [harnessState.memoryItems]
  );

  const previewText = useMemo(() => {
    if (!previewOpen) {
      return "";
    }
    const json = JSON.stringify(selectedContext, null, 2);
    if (json.length <= JSON_PREVIEW_LIMIT) {
      return json;
    }
    return `${json.slice(0, JSON_PREVIEW_LIMIT)}\n… truncated`;
  }, [selectedContext, previewOpen]);

  function updateAssistantTurn(
    turnId: string,
    patch: Partial<Extract<ChatThreadItem, { kind: "assistant" }>>
  ) {
    setThread((previous) =>
      previous.map((item) =>
        item.id === turnId && item.kind === "assistant" ? { ...item, ...patch } : item
      )
    );
  }

  function handleClearConversation() {
    synthesis.dismissSynthesis();
    setThread([]);
    setThreadState(createEmptySharedChatThreadState());
    setMessage("");
    setNotice(null);
    setLastSentPacketSummary(null);
  }

  function buildCompletedChatTurns(
    priorThread: ChatThreadItem[],
    userText: string,
    assistantAnswer: string
  ): ChatTurn[] {
    const base = buildConversationHistoryFromThread(priorThread);
    return [
      ...base,
      { role: "user", content: userText },
      { role: "assistant", content: assistantAnswer }
    ];
  }

  async function handleSend(messageOverride?: string) {
    const trimmed = (messageOverride ?? message).trim();
    if (!trimmed || loading) {
      return;
    }

    setNotice(null);
    setLoading(true);

    const priorThread = thread;
    const threadStateForSend = applyLikelyReferenceForSend(threadState, trimmed);
    const conversationHistory = packConversationHistoryForGateway({
      turns: buildConversationHistoryFromThread(priorThread),
      state: threadStateForSend,
      latestMessage: trimmed,
      maxChars: CHAT_HARNESS_MAX_HISTORY_CHARS
    });
    const wireThreadState = toWireChatHarnessThreadState(threadStateForSend);
    const threadStateJsonChars = JSON.stringify(wireThreadState, null, 2).length;

    setThread((previous) => [
      ...previous,
      { id: createId("chat-user"), kind: "user", text: trimmed, mode }
    ]);

    try {
      const sendPacket = buildInspectorPacket(trimmed, threadStateForSend, contextMode);
      setLastSentPacketSummary(formatPacketSliceSummary(sendPacket));
      const { context: contextForSend, conversationHistory: historyForSend } =
        resolveSendBundleFromPacket(sendPacket, {
          message: trimmed,
          conversationHistory,
          threadStateJsonChars
        });
      const sendPromptChars = estimateChatHarnessPromptChars(contextForSend, {
        message: trimmed,
        conversationHistory: historyForSend,
        threadStateJsonChars
      });
      if (sendPromptChars > DEFAULT_GATEWAY_MAX_INPUT_CHARS) {
        throw new ChatHarnessError(
          `Serialized prompt would be ~${sendPromptChars} chars; gateway limit is ${DEFAULT_GATEWAY_MAX_INPUT_CHARS}. Try Compact context, a shorter message, or raise SCOUT_MAX_INPUT_CHARS on ai-gateway.`
        );
      }

      const result = await askChatHarness({
        baseUrl,
        message: trimmed,
        mode,
        sensitivity,
        context: contextForSend,
        contextPacket: toWireContextPacket(sendPacket),
        conversationHistory: historyForSend,
        threadState: wireThreadState,
        reasoningDepth
      });

      const completedTurns = buildCompletedChatTurns(priorThread, trimmed, result.answer);
      setThreadState((previous) =>
        updateSharedChatThreadStateAfterTurn({
          previous,
          userMessage: trimmed,
          assistantAnswer: result.answer,
          turns: completedTurns
        })
      );

      setThread((previous) => [
        ...previous,
        {
          id: createId("chat-assistant"),
          kind: "assistant",
          userText: trimmed,
          mode,
          response: result,
          memorySaved: false,
          savedCandidateKeys: [],
          showMemoryPreview: false,
          showConfidence: false,
          showMemoryTools: false
        }
      ]);
      setMessage("");
      if (Platform.OS === "web") {
        inputRef.current?.focus();
      }
    } catch (error) {
      const formatted = formatSendError(error);
      setThread((previous) => [
        ...previous,
        {
          id: createId("chat-error"),
          kind: "error",
          text: formatted.text,
          contextMode,
          baseUrl,
          status: formatted.status
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSaveChatSummary(turnId: string, summary: HarnessChatSummary) {
    saveChatSummary(summary);
    updateAssistantTurn(turnId, { memorySaved: true });
    setNotice({ kind: "success", message: "Chat memory saved." });
  }

  function handleSaveMemoryBankCandidate(turnId: string, candidate: HarnessMemoryItem) {
    const key = memoryItemDedupeKey(candidate);
    const item = createMemoryItem({
      kind: candidate.kind,
      title: candidate.title,
      summary: candidate.summary,
      tags: candidate.tags,
      evidence: candidate.evidence,
      sourceChatSummaryId: candidate.sourceChatSummaryId,
      isActive: true
    });
    saveMemoryItem(item);
    setThread((previous) =>
      previous.map((entry) => {
        if (entry.id !== turnId || entry.kind !== "assistant") {
          return entry;
        }
        if (entry.savedCandidateKeys.includes(key)) {
          return entry;
        }
        return {
          ...entry,
          savedCandidateKeys: [...entry.savedCandidateKeys, key]
        };
      })
    );
    setNotice({ kind: "success", message: "Saved to Memory Bank." });
  }

  async function handleVariantPrompt(prompt: string) {
    setThreadState((previous) => applyVariantPromptToThreadState(previous, prompt));
    await handleSend(prompt);
  }

  const inspectorPanel = (
    <AskHarnessAdvancedPanel
      baseUrl={baseUrl}
      onBaseUrlChange={setBaseUrl}
      mode={mode}
      onModeChange={setMode}
      sensitivity={sensitivity}
      onSensitivityChange={setSensitivity}
      reasoningDepth={reasoningDepth}
      onReasoningDepthChange={setReasoningDepth}
      contextMode={contextMode}
      onContextModeChange={setContextModeOverride}
      selectedJsonChars={selectedJsonChars}
      selectedPromptChars={selectedPromptChars}
      fullChars={fullChars}
      compactChars={compactChars}
      fullPromptChars={fullPromptChars}
      compactPromptChars={compactPromptChars}
      promptOverBudget={promptOverBudget}
      packetSliceSummary={packetSliceSummary}
      qualitySummary={qualitySummary}
      qualityOpen={qualityOpen}
      onQualityOpenToggle={() => setQualityOpen((open) => !open)}
      previewOpen={previewOpen}
      onPreviewOpenToggle={() => setPreviewOpen((open) => !open)}
      previewText={previewText}
      recentMemories={recentMemories}
      onDeleteChatSummary={deleteChatSummary}
      recentMemoryBankItems={recentMemoryBankItems}
      onToggleMemoryItemActive={toggleMemoryItemActive}
      onDeleteMemoryItem={deleteMemoryItem}
    />
  );

  return (
    <Screen>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <PageHeader
        title="Companion"
        subtitle="Reads your board and can suggest changes. You approve what changes."
      />

      <View style={isWideLayout ? styles.chatLayoutRow : undefined}>
        <View style={styles.chatPrimaryColumn}>
          <HarnessReadCard
            contextMode={contextMode}
            context={selectedContext}
            chatSummaryCount={harnessState.chatSummaries.length}
            memoryItemCount={harnessState.memoryItems.length}
            activeMemoryCount={activeMemoryCount}
            activeLimitSignal={activeLimitSignal}
          />

          <View style={[styles.chatSurface, { height: chatSurfaceHeight }]}>
            {thread.length > 0 ? (
              <View style={styles.chatThreadToolbar}>
                <Pressable style={styles.smallButton} onPress={handleClearConversation}>
                  <Text style={styles.smallButtonText}>Clear conversation</Text>
                </Pressable>
                {showSynthesisAction ? (
                  <Pressable
                    style={styles.smallButton}
                    disabled={synthesisDisabled}
                    onPress={() => void synthesis.startSynthesis()}
                  >
                    <Text style={styles.smallButtonText}>Deep synthesis</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {!synthesis.eligible && showSynthesisAction && sensitivity !== "S3" ? (
              <Text style={styles.helpText}>
                Need a bit more conversation first — send another message.
              </Text>
            ) : null}
            <SynthesisJobPanel
              jobState={synthesis.jobState}
              onDismiss={synthesis.dismissSynthesis}
              onRetry={() => void synthesis.retrySynthesis()}
            />
            <ChatThreadContextPanel
              threadState={threadState}
              onThreadStateChange={setThreadState}
            />
            <ChatThread
              thread={thread}
              threadScrollRef={threadScrollRef}
              loading={loading}
              memoryItems={harnessState.memoryItems}
              onSelectPrompt={handleQuickQuestion}
              onToggleConfidence={(turnId) =>
              setThread((previous) =>
                previous.map((item) =>
                  item.id === turnId && item.kind === "assistant"
                    ? { ...item, showConfidence: !item.showConfidence }
                    : item
                )
              )
            }
            onToggleMemoryTools={(turnId) =>
              setThread((previous) =>
                previous.map((item) =>
                  item.id === turnId && item.kind === "assistant"
                    ? { ...item, showMemoryTools: !item.showMemoryTools }
                    : item
                )
              )
            }
            onToggleMemoryPreview={(turnId) =>
              setThread((previous) =>
                previous.map((item) =>
                  item.id === turnId && item.kind === "assistant"
                    ? { ...item, showMemoryPreview: !item.showMemoryPreview }
                    : item
                )
              )
            }
              onSaveChatSummary={handleSaveChatSummary}
              onSaveMemoryBankCandidate={handleSaveMemoryBankCandidate}
              onVariantPrompt={(prompt) => void handleVariantPrompt(prompt)}
            />

            <ChatComposer
              message={message}
              loading={loading}
              quickQuestions={QUICK_QUESTIONS}
              inputRef={inputRef}
              onMessageChange={setMessage}
              onQuickQuestion={handleQuickQuestion}
              onSend={() => void handleSend()}
            />
          </View>
        </View>

        {isWideLayout ? (
          inspectorPanel
        ) : (
          <View style={styles.chatSecondaryColumn}>
            <Pressable style={styles.smallButton} onPress={() => setAdvancedOpen((open) => !open)}>
              <Text style={styles.smallButtonText}>
                {advancedOpen ? "Hide inspector" : "Show inspector"}
              </Text>
            </Pressable>
            {advancedOpen ? inspectorPanel : null}
          </View>
        )}
      </View>
    </Screen>
  );
}
