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
import { CompanionBudgetSection } from "../src/components/askHarness/CompanionBudgetSection";
import { ChatComposer, type QuickQuestion } from "../src/components/askHarness/ChatComposer";
import { ChatThreadContextPanel } from "../src/components/askHarness/ChatThreadContextPanel";
import type { ProposalUiStatus } from "../src/components/assistantActions/AssistantActionProposalCard";
import { ChatThread } from "../src/components/askHarness/ChatThread";
import { HarnessReadCard } from "../src/components/askHarness/HarnessReadCard";
import { SynthesisJobPanel } from "../src/components/askHarness/SynthesisJobPanel";
import { useDeepSynthesisJob } from "../src/components/askHarness/useDeepSynthesisJob";
import type { ChatThreadItem, ContextExportMode } from "../src/components/askHarness/types";
import {
  ChatBackroomPanel,
  ChatBackroomSection,
  type ChatBackroomSectionId
} from "../src/components/chat/ChatBackroomPanel";
import { shouldUseChatBackroomSideLayout } from "../src/components/chat/chatBackroomLayout";
import { ChatStateStrip } from "../src/components/chat/ChatStateStrip";
import { ChatSurfaceFrame } from "../src/components/chat/ChatSurfaceFrame";
import { getChatSurfaceHeight } from "../src/components/chatSurfaceLayout";
import { PageHeader } from "../src/components/PageHeader";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { styles } from "../src/components/styles";
import {
  buildCompanionStateChips,
  type ChatStateChipDescriptor
} from "../src/core/chatBackroomSummary";
import {
  askChatHarness,
  ChatHarnessError,
  DEFAULT_CHAT_HARNESS_URL,
  type ReasoningDepth
} from "../src/core/chatHarnessClient";
import { buildConversationHistoryFromThread } from "../src/core/askHarnessThreadAdapter";
import { buildChatHarnessSendBundle } from "../src/core/chatHarnessSendBudget";
import {
  applyVariantPromptToThreadState,
  createEmptySharedChatThreadState,
  updateSharedChatThreadStateAfterTurn,
  type ChatTurn,
  type SharedChatThreadState
} from "../src/core/chatThreadState";
import { buildAiContextPacket } from "../src/core/contextPacketBuilder";
import { formatPacketSliceSummary } from "../src/core/contextPacketShim";
import { toWireContextPacket } from "../src/core/contextPacketWire";
import {
  fallbackGatewayHealthBudget,
  fetchGatewayHealthBudget,
  type GatewayHealthBudget
} from "../src/core/gatewayHealthClient";
import {
  buildCompactHarnessContext,
  buildContextQualitySummary,
  buildHarnessContext,
  estimateHarnessContextChars,
  getActiveLimitSignal,
  shouldAutoSelectCompactExport,
  type ChatHarnessMode,
  type HarnessExportInput
} from "../src/core/harnessContext";
import type { AssistantProposedAction } from "../src/core/assistantActionRegistry";
import type { LifeHarnessData } from "../src/core/actions";
import { createId } from "../src/core/ids";
import {
  createMemoryItem,
  memoryItemDedupeKey,
  sortMemoryItemsNewestFirst
} from "../src/core/harnessMemoryBank";
import type { HarnessChatSummary, HarnessMemoryItem, SensitivityLevel } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const QUICK_QUESTIONS: { label: string; message: string; mode: ChatHarnessMode }[] = [
  { label: "Next?", message: "What should I do next?", mode: "operator" },
  { label: "Avoiding?", message: "What am I avoiding?", mode: "operator" },
  { label: "Smaller", message: "Make this smaller.", mode: "reflection" },
  { label: "Pattern?", message: "What pattern are you noticing?", mode: "general" }
];

const JSON_PREVIEW_LIMIT = 4000;

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
    text: "Unexpected error while contacting Companion. Check the gateway URL and try again."
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
    toggleMemoryItemActive,
    confirmAssistantAction
  } = harnessState;
  const { height, width } = useWindowDimensions();
  const useSideBackroom = shouldUseChatBackroomSideLayout(width);
  const chatSurfaceHeight = getChatSurfaceHeight(height, "harness");
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
  const [lastSentPacketSummary, setLastSentPacketSummary] = useState<string | null>(null);
  const [gatewayBudget, setGatewayBudget] = useState<GatewayHealthBudget>(() =>
    fallbackGatewayHealthBudget()
  );
  const [backroomOpen, setBackroomOpen] = useState(false);
  const [backroomSection, setBackroomSection] = useState<ChatBackroomSectionId | null>(null);
  const [lastBudgetNotice, setLastBudgetNotice] = useState<string | null>(null);
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, ProposalUiStatus>>({});

  const lifeHarnessData = useMemo((): LifeHarnessData => {
    const {
      cards,
      logs,
      proofItems,
      dailyState,
      resumeModules,
      jobCandidates,
      jobSources,
      jobSourceRuns,
      chatSummaries,
      memoryItems,
      projects,
      agentSessions,
      featureSprintPlans,
      featureSprintRunnerRuns,
      careerSourcePack
    } = harnessState;
    return {
      cards,
      logs,
      proofItems,
      dailyState,
      resumeModules,
      jobCandidates,
      jobSources,
      jobSourceRuns,
      chatSummaries,
      memoryItems,
      projects,
      agentSessions,
      featureSprintPlans,
      featureSprintRunnerRuns,
      careerSourcePack
    };
  }, [harnessState]);

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
    const digest = typeof digestParam === "string" ? digestParam.trim() : "";
    if (!digest) {
      return;
    }
    setMessage(digest);
    setThread([]);
    setThreadState(createEmptySharedChatThreadState());
  }, [digestParam]);

  useEffect(() => {
    let cancelled = false;
    void fetchGatewayHealthBudget(baseUrl).then((budget) => {
      if (!cancelled) {
        setGatewayBudget(budget);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const exportInput = useMemo(() => buildExportInput(harnessState), [harnessState]);
  const fullContext = useMemo(() => buildHarnessContext(exportInput), [exportInput]);
  const compactContext = useMemo(() => buildCompactHarnessContext(exportInput), [exportInput]);
  const fullChars = useMemo(() => estimateHarnessContextChars(fullContext), [fullContext]);
  const compactChars = useMemo(() => estimateHarnessContextChars(compactContext), [compactContext]);
  const fullSendBundle = useMemo(
    () =>
      buildChatHarnessSendBundle({
        exportInput,
        message,
        priorThread: thread,
        threadState,
        preferredContextMode: "full",
        reasoningDepth,
        maxPromptChars: gatewayBudget.maxInputChars,
        buildPacket: () => buildInspectorPacket(message, threadState, "full")
      }),
    [exportInput, message, thread, threadState, reasoningDepth, gatewayBudget.maxInputChars]
  );
  const compactSendBundle = useMemo(
    () =>
      buildChatHarnessSendBundle({
        exportInput,
        message,
        priorThread: thread,
        threadState,
        preferredContextMode: "compact",
        reasoningDepth,
        maxPromptChars: gatewayBudget.maxInputChars,
        buildPacket: () => buildInspectorPacket(message, threadState, "compact")
      }),
    [exportInput, message, thread, threadState, reasoningDepth, gatewayBudget.maxInputChars]
  );
  const fullPromptChars = fullSendBundle.estimatedChars;
  const compactPromptChars = compactSendBundle.estimatedChars;
  const autoContextMode: ContextExportMode = shouldAutoSelectCompactExport(fullContext, message)
    ? "compact"
    : "full";
  const [contextModeOverride, setContextModeOverride] = useState<ContextExportMode | null>(null);
  const contextMode = contextModeOverride ?? autoContextMode;
  const selectedContext = contextMode === "compact" ? compactContext : fullContext;
  const selectedJsonChars = contextMode === "compact" ? compactChars : fullChars;
  const selectedPromptChars = contextMode === "compact" ? compactPromptChars : fullPromptChars;
  const selectedSendBundle = contextMode === "compact" ? compactSendBundle : fullSendBundle;
  const promptOverBudget = !selectedSendBundle.fits;
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
    mode,
    maxPromptChars: gatewayBudget.maxInputChars,
    reasoningDepth
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

  const stateChips = useMemo(
    () =>
      buildCompanionStateChips({
        boardContextReady: harnessState.cards.length >= 0,
        activeMemoryCount,
        memoryItemCount: harnessState.memoryItems.length,
        mode,
        reasoningDepth,
        budget: {
          promptOverBudget,
          hasCompactionNotice: Boolean(lastBudgetNotice)
        }
      }),
    [
      harnessState.cards.length,
      activeMemoryCount,
      harnessState.memoryItems.length,
      mode,
      reasoningDepth,
      promptOverBudget,
      lastBudgetNotice
    ]
  );

  useEffect(() => {
    if (promptOverBudget) {
      setBackroomOpen(true);
      setBackroomSection("budget");
    }
  }, [promptOverBudget]);

  function handleStateChipPress(chip: ChatStateChipDescriptor) {
    if (chip.id === "backroom") {
      setBackroomOpen((open) => !open);
      return;
    }
    if (chip.sectionId) {
      setBackroomSection(chip.sectionId as ChatBackroomSectionId);
      setBackroomOpen(true);
    }
  }

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
    setProposalStatuses({});
    setMessage("");
    setNotice(null);
    setLastSentPacketSummary(null);
    setLastBudgetNotice(null);
  }

  function handleApproveProposal(proposalId: string, action: AssistantProposedAction) {
    const result = confirmAssistantAction(action);
    if (result.ok) {
      setProposalStatuses((previous) => ({ ...previous, [proposalId]: "approved" }));
      setNotice({ kind: "success", message: result.message ?? "Action applied." });
      return;
    }
    setNotice({ kind: "error", message: result.message ?? "Could not apply action." });
  }

  function handleDismissProposal(proposalId: string) {
    setProposalStatuses((previous) => ({ ...previous, [proposalId]: "dismissed" }));
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

    setThread((previous) => [
      ...previous,
      { id: createId("chat-user"), kind: "user", text: trimmed, mode }
    ]);
    setMessage("");

    try {
      const sendPacket = buildInspectorPacket(trimmed, threadState, contextMode);
      setLastSentPacketSummary(formatPacketSliceSummary(sendPacket));
      const sendBundle = buildChatHarnessSendBundle({
        exportInput,
        message: trimmed,
        priorThread,
        threadState,
        preferredContextMode: contextMode,
        reasoningDepth,
        maxPromptChars: gatewayBudget.maxInputChars,
        buildPacket: () => sendPacket
      });
      if (!sendBundle.fits) {
        throw new ChatHarnessError(
          `Serialized prompt would be ~${sendBundle.estimatedChars} chars; gateway limit is ${gatewayBudget.maxInputChars}. Try Compact context, a shorter message, or raise SCOUT_MAX_INPUT_CHARS on ai-gateway.`
        );
      }
      if (sendBundle.notice) {
        setNotice({ kind: "info", message: sendBundle.notice.message });
        setLastBudgetNotice(sendBundle.notice.message);
      }

      const result = await askChatHarness({
        baseUrl,
        message: trimmed,
        mode,
        sensitivity,
        context: sendBundle.context,
        contextPacket: toWireContextPacket(sendPacket),
        conversationHistory: sendBundle.conversationHistory,
        threadState: sendBundle.wireThreadState,
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
      if (Platform.OS === "web") {
        inputRef.current?.focus();
      }
    } catch (error) {
      setMessage(trimmed);
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
      embedded
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
      gatewayMaxInputChars={gatewayBudget.maxInputChars}
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

  const backroomPanel = (
    <ChatBackroomPanel
      open={backroomOpen}
      onClose={() => {
        setBackroomOpen(false);
        setBackroomSection(null);
      }}
      focusedSection={backroomSection}
      layout={useSideBackroom ? "side" : "inline"}
    >
      <ChatBackroomSection sectionId="context" focused={backroomSection === "context"}>
        <ChatThreadContextPanel threadState={threadState} onThreadStateChange={setThreadState} />
      </ChatBackroomSection>
      <ChatBackroomSection sectionId="board" focused={backroomSection === "board"}>
        {inspectorPanel}
      </ChatBackroomSection>
      <ChatBackroomSection sectionId="budget" focused={backroomSection === "budget"}>
        <CompanionBudgetSection
          selectedPromptChars={selectedPromptChars}
          gatewayMaxInputChars={gatewayBudget.maxInputChars}
          promptOverBudget={promptOverBudget}
          contextMode={contextMode}
          lastNoticeMessage={lastBudgetNotice}
        />
      </ChatBackroomSection>
    </ChatBackroomPanel>
  );

  const chatFrame = (
    <ChatSurfaceFrame
      variant="companion"
      height={chatSurfaceHeight}
      toolbar={
        thread.length > 0 ? (
          <>
            <Pressable style={styles.smallButton} onPress={handleClearConversation}>
              <Text style={styles.smallButtonText}>Clear conversation</Text>
            </Pressable>
            {showSynthesisAction ? (
              <Pressable
                style={styles.smallButton}
                disabled={synthesisDisabled}
                onPress={() => void synthesis.startSynthesis()}
              >
                <Text style={styles.smallButtonText}>Synthesize this thread</Text>
              </Pressable>
            ) : null}
          </>
        ) : null
      }
      composer={
        <ChatComposer
          message={message}
          loading={loading}
          quickQuestions={QUICK_QUESTIONS}
          placeholder="Ask your companion…"
          inputRef={inputRef}
          onMessageChange={setMessage}
          onQuickQuestion={handleQuickQuestion}
          onSend={() => void handleSend()}
        />
      }
    >
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
      <ChatThread
        thread={thread}
        threadScrollRef={threadScrollRef}
        loading={loading}
        memoryItems={harnessState.memoryItems}
        lifeHarnessData={lifeHarnessData}
        proposalStatuses={proposalStatuses}
        onApproveProposal={handleApproveProposal}
        onDismissProposal={handleDismissProposal}
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
    </ChatSurfaceFrame>
  );

  return (
    <Screen>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <PageHeader
        title="Companion"
        subtitle="Ask about your board. You approve any change."
      />

      <View style={styles.chatPrimaryColumn}>
        <View style={styles.checklist}>
          <Text style={styles.helpText}>Grounded</Text>
          <Text style={styles.bodyText}>
            Uses board context for suggestions. It does not change cards unless you choose an action.
          </Text>
        </View>
        <HarnessReadCard />

        <ChatStateStrip
          variant="companion"
          chips={stateChips}
          backroomOpen={backroomOpen}
          onChipPress={handleStateChipPress}
        />

        {!useSideBackroom && backroomOpen ? backroomPanel : null}

        <View style={useSideBackroom ? styles.chatBackroomChatRow : undefined}>
          <View style={useSideBackroom ? styles.chatBackroomChatColumn : undefined}>
            {chatFrame}
          </View>
          {useSideBackroom && backroomOpen ? backroomPanel : null}
        </View>
      </View>
    </Screen>
  );
}
