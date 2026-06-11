import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";

import { ChatComposer, type QuickQuestion } from "../src/components/askHarness/ChatComposer";
import { ChatAdvancedPanel } from "../src/components/chat/ChatAdvancedPanel";
import { ChatSurfaceFrame } from "../src/components/chat/ChatSurfaceFrame";
import { getChatSurfaceHeight } from "../src/components/chatSurfaceLayout";
import { formatGatewayHost } from "../src/components/askHarness/askHarnessInspectorFormat";
import { Notice, type NoticeState } from "../src/components/Notice";
import { PageHeader } from "../src/components/PageHeader";
import { SafetyBanner } from "../src/components/SafetyBanner";
import {
  CompanionSelfMemoryPanel,
  countActiveSelfMemories
} from "../src/components/rawLab/CompanionSelfMemoryPanel";
import { RawLabBudgetInspector } from "../src/components/rawLab/RawLabBudgetInspector";
import { RawLabThread, type RawLabThreadError, type RawLabTurnDisplay } from "../src/components/rawLab/RawLabThread";
import { RawLabThreadMemoryPanel } from "../src/components/rawLab/RawLabThreadMemoryPanel";
import { Screen } from "../src/components/Screen";
import { styles } from "../src/components/styles";
import { createId } from "../src/core/ids";
import {
  activeCompanionSelfMemoriesForSend,
  applyBatchedLastUsedAt,
  createCompanionSelfMemory,
  type CompanionSelfMemory
} from "../src/core/companionSelfMemory";
import {
  flushPendingCompanionLastUsedAt,
  loadCompanionSelfMemories,
  saveCompanionSelfMemories
} from "../src/core/companionSelfMemoryStore";
import {
  DEFAULT_RAW_LAB_URL,
  RawLabError,
  streamRawLab,
  type RawLabResponse
} from "../src/core/rawLabClient";
import {
  DEFAULT_RAW_LAB_MAX_INPUT_CHARS,
  DEFAULT_GATEWAY_MAX_INPUT_CHARS
} from "../src/core/gatewayBudget";
import {
  fetchGatewayHealthBudget,
  type GatewayHealthBudget
} from "../src/core/gatewayHealthClient";
import type { RawLabBudgetLevel, RawLabCompactionNotice } from "../src/core/rawLabContextBudget";
import {
  reflectOnRawLab,
  type RawLabSelfMemoryProposal
} from "../src/core/rawLabSelfReflectionClient";
import { buildGroundedHandoffDigest, shouldSuggestGroundedHandoff } from "../src/core/chatThreadState";
import {
  addConversationalInstinct,
  addDoNotRepeat,
  addOpenLoop,
  addRecurringInterest,
  addUserDislike,
  addUserRespondsWellTo,
  addVoiceTrait,
  clearThreadState,
  compactText,
  createEmptyRawLabThreadState,
  pinFact,
  RAW_LAB_MAX_STANCE_CHARS,
  setCurrentStance,
  updateRawLabThreadStateAfterTurn,
  type RawLabThreadState,
  type RawLabTurn
} from "../src/core/rawLabThreadState";

const QUICK_QUESTIONS = [
  { label: "Blunt", message: "Give me a blunt take.", mode: "general" as const },
  { label: "Weird", message: "Give me a weird speculative riff.", mode: "general" as const },
  { label: "Playful", message: "Be playful and less corporate.", mode: "general" as const },
  { label: "Challenge", message: "Challenge my assumption directly.", mode: "general" as const }
];

function formatSendError(error: unknown): { text: string; status?: number } {
  if (error instanceof RawLabError) {
    return { text: error.message, status: error.status };
  }

  return {
    text: "Unexpected error while contacting Raw Signal. Check the gateway URL and try again."
  };
}

function toDisplayTurns(
  turns: RawLabTurn[],
  responses: Record<string, RawLabResponse>
): RawLabTurnDisplay[] {
  return turns.map((turn) => ({
    turn,
    response: turn.role === "assistant" ? responses[turn.id] : undefined
  }));
}

export default function RawLabScreen() {
  const [baseUrl] = useState(DEFAULT_RAW_LAB_URL);
  const [gatewayBudget, setGatewayBudget] = useState<GatewayHealthBudget>({
    maxInputChars: DEFAULT_GATEWAY_MAX_INPUT_CHARS,
    rawLabMaxInputChars: DEFAULT_RAW_LAB_MAX_INPUT_CHARS,
    timeoutSeconds: 180
  });
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<RawLabTurn[]>([]);
  const [responses, setResponses] = useState<Record<string, RawLabResponse>>({});
  const [errors, setErrors] = useState<RawLabThreadError[]>([]);
  const [threadState, setThreadState] = useState<RawLabThreadState>(createEmptyRawLabThreadState);
  const [loading, setLoading] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [lastSendStats, setLastSendStats] = useState<{
    estimatedChars: number;
    level: RawLabBudgetLevel;
    turnsSent: number;
    memoriesSent: number;
    budgetCapChars: number;
    notice?: RawLabCompactionNotice;
  } | null>(null);
  const [handoffDismissed, setHandoffDismissed] = useState(false);
  const [companionMemories, setCompanionMemories] = useState<CompanionSelfMemory[]>([]);
  const [chatOnlyMemories, setChatOnlyMemories] = useState<CompanionSelfMemory[]>([]);
  const [reflectionProposals, setReflectionProposals] = useState<RawLabSelfMemoryProposal[]>([]);
  const [reflecting, setReflecting] = useState(false);
  const pendingUsedMemoryIdsRef = useRef<Set<string>>(new Set());
  const gatewayHealthPolledRef = useRef(false);

  function ensureGatewayBudget() {
    if (gatewayHealthPolledRef.current) {
      return;
    }
    gatewayHealthPolledRef.current = true;
    void fetchGatewayHealthBudget(baseUrl).then((budget) => {
      setGatewayBudget(budget);
    });
  }

  useEffect(() => {
    setCompanionMemories(loadCompanionSelfMemories());
  }, []);

  useEffect(() => {
    const pendingIds = pendingUsedMemoryIdsRef;
    return () => {
      flushPendingCompanionLastUsedAt(pendingIds.current);
      pendingIds.current.clear();
    };
  }, []);

  function persistCompanionMemories(next: CompanionSelfMemory[]) {
    setCompanionMemories(next);
    saveCompanionSelfMemories(next);
  }

  function flushLastUsedAt(usedIds: string[]) {
    if (usedIds.length === 0) {
      return;
    }
    for (const id of usedIds) {
      pendingUsedMemoryIdsRef.current.add(id);
    }
    const flushed = applyBatchedLastUsedAt({
      memories: loadCompanionSelfMemories(),
      usedIds: pendingUsedMemoryIdsRef.current
    });
    pendingUsedMemoryIdsRef.current.clear();
    persistCompanionMemories(flushed);
  }

  function memoriesForSend(): CompanionSelfMemory[] {
    return activeCompanionSelfMemoriesForSend(companionMemories, chatOnlyMemories);
  }
  const showHandoffBanner =
    !handoffDismissed &&
    (shouldSuggestGroundedHandoff(message) ||
      turns.some((turn) => turn.role === "user" && shouldSuggestGroundedHandoff(turn.content)));
  const { height } = useWindowDimensions();
  const chatSurfaceHeight = getChatSurfaceHeight(height, "rawLab");
  const threadScrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const abortRef = useRef<AbortController | null>(null);

  function handleQuickQuestion(item: QuickQuestion) {
    setMessage(item.message);
    if (Platform.OS === "web") {
      inputRef.current?.focus();
    }
  }

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || loading) {
      return;
    }

    setNotice(null);
    setLoading(true);
    ensureGatewayBudget();
    setStreamingAnswer("");
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    const priorTurns = turns;
    const userTurn: RawLabTurn = {
      id: createId("raw-user"),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString()
    };

    setTurns((previous) => [...previous, userTurn]);
    setErrors([]);

    try {
      const sendResult = await streamRawLab({
        baseUrl,
        message: trimmed,
        turns: priorTurns,
        threadState,
        companionSelfMemories: memoriesForSend(),
        maxInputChars: gatewayBudget.rawLabMaxInputChars,
        signal: abortController.signal,
        onChunk: (chunk) => {
          setStreamingAnswer((previous) => previous + chunk);
        }
      });
      const response = sendResult.response;

      if (sendResult.notice) {
        setNotice({ kind: "info", message: sendResult.notice.message });
      }
      if (sendResult.sendStats) {
        setLastSendStats({
          estimatedChars: sendResult.sendStats.estimatedChars,
          level: sendResult.sendStats.level,
          turnsSent: sendResult.sendStats.turnsSent,
          memoriesSent: sendResult.sendStats.memoriesSent,
          budgetCapChars: sendResult.sendStats.budgetCapChars,
          notice: sendResult.notice
        });
        flushLastUsedAt(sendResult.sendStats.injectedMemoryIds);
      }

      const assistantTurn: RawLabTurn = {
        id: createId("raw-assistant"),
        role: "assistant",
        content: response.answer,
        createdAt: new Date().toISOString()
      };

      const completedTurns = [...priorTurns, userTurn, assistantTurn];
      setTurns(completedTurns);
      setResponses((previous) => ({ ...previous, [assistantTurn.id]: response }));
      setThreadState((previous) =>
        updateRawLabThreadStateAfterTurn({
          previous,
          userMessage: trimmed,
          assistantAnswer: response.answer,
          turns: completedTurns
        })
      );
      setMessage("");
      setStreamingAnswer("");
      if (Platform.OS === "web") {
        inputRef.current?.focus();
      }
    } catch (error) {
      const formatted = formatSendError(error);
      setErrors([{ id: createId("raw-error"), content: formatted.text }]);
      setNotice({
        kind: "error",
        message:
          formatted.status === 503
            ? `${formatted.text} Start ai-gateway with SCOUT_PROVIDER=mock if needed.`
            : formatted.text
      });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handleStopStream() {
    abortRef.current?.abort();
  }

  function handleUseBoardContext() {
    const digest = buildGroundedHandoffDigest({
      state: threadState,
      recentUserMessages: turns.filter((turn) => turn.role === "user").map((turn) => turn.content)
    });
    router.push({ pathname: "/ask-harness", params: { digest } });
  }

  function handleClearChat() {
    setTurns([]);
    setResponses({});
    setErrors([]);
    setThreadState(clearThreadState());
    setChatOnlyMemories([]);
    setReflectionProposals([]);
    setMessage("");
    setStreamingAnswer("");
    setNotice(null);
    setLastSendStats(null);
  }

  async function handleReflect() {
    if (reflecting || turns.length === 0) {
      return;
    }
    setReflecting(true);
    setNotice(null);
    try {
      const result = await reflectOnRawLab({
        baseUrl,
        turns,
        threadState,
        existingSelfMemories: companionMemories
      });
      setReflectionProposals(result.proposals);
      if (result.safety_notes.length > 0) {
        setNotice({ kind: "info", message: result.safety_notes.join(" ") });
      }
    } catch (error) {
      const formatted = formatSendError(error);
      setNotice({ kind: "error", message: formatted.text });
    } finally {
      setReflecting(false);
    }
  }

  function handleSessionOnlyProposal(proposal: RawLabSelfMemoryProposal, index: number) {
    const created = createCompanionSelfMemory({
      kind: proposal.kind as CompanionSelfMemory["kind"],
      subject: proposal.subject,
      text: proposal.text,
      source: "user_approved_proposal",
      confidence: proposal.confidence,
      sensitivity: proposal.sensitivity
    });
    if (!created.ok) {
      setNotice({ kind: "error", message: created.reason });
      return;
    }
    setChatOnlyMemories((previous) => [...previous, created.memory]);
    setReflectionProposals((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }

  function handlePin(content: string) {
    setThreadState((previous) => pinFact(previous, content));
  }

  function handleDoNotRepeat(content: string) {
    setThreadState((previous) => addDoNotRepeat(previous, content));
  }

  function handleOpenLoop(content: string) {
    setThreadState((previous) => addOpenLoop(previous, content));
  }

  function updatePersonality(
    updater: (state: RawLabThreadState) => RawLabThreadState["personality"]
  ) {
    setThreadState((previous) => ({
      ...previous,
      personality: updater(previous),
      updatedAt: new Date().toISOString()
    }));
  }

  function handleAddVoiceTrait(content: string) {
    updatePersonality((previous) => addVoiceTrait(previous.personality, content));
  }

  function handleAddConversationalInstinct(content: string) {
    updatePersonality((previous) =>
      addConversationalInstinct(previous.personality, content)
    );
  }

  function handleAddRecurringInterest(content: string) {
    updatePersonality((previous) => addRecurringInterest(previous.personality, content));
  }

  function handleAddUserRespondsWellTo(content: string) {
    updatePersonality((previous) => addUserRespondsWellTo(previous.personality, content));
  }

  function handleAddUserDislike(content: string) {
    updatePersonality((previous) => addUserDislike(previous.personality, content));
  }

  function handleSetCurrentStance(content: string) {
    updatePersonality((previous) =>
      setCurrentStance(
        previous.personality,
        compactText(`Current stance in this chat: ${content}`, RAW_LAB_MAX_STANCE_CHARS)
      )
    );
  }

  const budgetForceExpanded = Boolean(lastSendStats?.notice);
  const selfMemoryCount = countActiveSelfMemories(companionMemories);
  const backroomBadge =
    selfMemoryCount + reflectionProposals.length > 0
      ? `${selfMemoryCount + reflectionProposals.length} notes`
      : undefined;

  return (
    <Screen>
      <View style={styles.chatPrimaryColumn}>
        <PageHeader
          title="Raw Signal"
          subtitle="Ungrounded riffs and experiments. Nothing here changes your board."
        />

        <SafetyBanner
          message="Sandbox only. Raw Signal cannot read or change your board."
          detail="Do not paste secrets or S3-style private data here (therapy logs, money/vice details, deeply personal content). Raw Signal is ungrounded and not treated as a secure vault."
          detailCollapsed
        />

        {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

        <ChatSurfaceFrame
          variant="rawSignal"
          height={chatSurfaceHeight}
          toolbar={
            <>
              <Pressable style={styles.smallButton} onPress={handleClearChat}>
                <Text style={styles.smallButtonText}>Clear chat</Text>
              </Pressable>
              {turns.length > 0 ? (
                <Pressable style={styles.smallButton} onPress={handleUseBoardContext}>
                  <Text style={styles.smallButtonText}>Open in Companion with board context</Text>
                </Pressable>
              ) : null}
              {loading ? (
                <Pressable style={styles.smallButton} onPress={handleStopStream}>
                  <Text style={styles.smallButtonText}>Stop</Text>
                </Pressable>
              ) : null}
              {showHandoffBanner ? (
                <View style={styles.bannerInfo}>
                  <Text style={styles.bannerInfoText}>
                    This sounds like a board question. Open in Companion for grounded help.
                  </Text>
                  <View style={styles.splitRow}>
                    <Pressable style={styles.smallButton} onPress={handleUseBoardContext}>
                      <Text style={styles.smallButtonText}>Open in Companion with board context</Text>
                    </Pressable>
                    <Pressable style={styles.smallButton} onPress={() => setHandoffDismissed(true)}>
                      <Text style={styles.smallButtonText}>Stay in Raw Signal</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          }
          composer={
            <ChatComposer
              message={message}
              loading={loading}
              quickQuestions={QUICK_QUESTIONS}
              placeholder="Say anything — ungrounded sandbox…"
              inputRef={inputRef}
              onMessageChange={setMessage}
              onQuickQuestion={handleQuickQuestion}
              onSend={() => void handleSend()}
            />
          }
        >
          <RawLabThread
            turns={toDisplayTurns(turns, responses)}
            errors={errors}
            threadScrollRef={threadScrollRef}
            loading={loading}
            streamingDraft={streamingAnswer}
            onSelectPrompt={handleQuickQuestion}
            onPin={handlePin}
            onDoNotRepeat={handleDoNotRepeat}
            onOpenLoop={handleOpenLoop}
            onAddVoiceTrait={handleAddVoiceTrait}
            onAddConversationalInstinct={handleAddConversationalInstinct}
            onAddRecurringInterest={handleAddRecurringInterest}
            onAddUserRespondsWellTo={handleAddUserRespondsWellTo}
            onAddUserDislike={handleAddUserDislike}
            onSetCurrentStance={handleSetCurrentStance}
          />
        </ChatSurfaceFrame>

        <ChatAdvancedPanel
          title="Backroom"
          badge={backroomBadge}
          defaultOpen={reflectionProposals.length > 0}
          onExpandedChange={(open) => {
            if (open) {
              ensureGatewayBudget();
            }
          }}
        >
          <Text style={styles.chatInspectorStatusLine}>
            {formatGatewayHost(baseUrl)} · Ungrounded · ephemeral
          </Text>
          <RawLabThreadMemoryPanel threadState={threadState} onThreadStateChange={setThreadState} />
          <CompanionSelfMemoryPanel
            memories={companionMemories}
            proposals={reflectionProposals}
            reflecting={reflecting}
            onMemoriesChange={persistCompanionMemories}
            onSessionOnly={handleSessionOnlyProposal}
            onReflect={() => void handleReflect()}
            onDismissProposal={(index) =>
              setReflectionProposals((previous) =>
                previous.filter((_, itemIndex) => itemIndex !== index)
              )
            }
          />
          <RawLabBudgetInspector
            turns={turns}
            threadState={threadState}
            message={message}
            gatewayRawLabMaxInputChars={gatewayBudget.rawLabMaxInputChars}
            gatewayMaxInputChars={gatewayBudget.maxInputChars}
            companionSelfMemories={memoriesForSend()}
            forceExpanded={budgetForceExpanded}
            lastSend={lastSendStats ?? undefined}
          />
        </ChatAdvancedPanel>
      </View>
    </Screen>
  );
}
