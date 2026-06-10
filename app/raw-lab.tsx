import { useRef, useState } from "react";
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
import { getChatSurfaceHeight } from "../src/components/chatSurfaceLayout";
import { formatGatewayHost } from "../src/components/askHarness/askHarnessInspectorFormat";
import { Nav } from "../src/components/Nav";
import { Notice, type NoticeState } from "../src/components/Notice";
import { RawLabThread, type RawLabThreadError, type RawLabTurnDisplay } from "../src/components/rawLab/RawLabThread";
import { RawLabThreadMemoryPanel } from "../src/components/rawLab/RawLabThreadMemoryPanel";
import { Screen } from "../src/components/Screen";
import { styles } from "../src/components/styles";
import { createId } from "../src/core/ids";
import {
  askRawLab,
  DEFAULT_RAW_LAB_URL,
  RawLabError,
  streamRawLab,
  type RawLabResponse
} from "../src/core/rawLabClient";
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
    text: "Unexpected error while contacting Raw Lab. Check the gateway URL and try again."
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
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<RawLabTurn[]>([]);
  const [responses, setResponses] = useState<Record<string, RawLabResponse>>({});
  const [errors, setErrors] = useState<RawLabThreadError[]>([]);
  const [threadState, setThreadState] = useState<RawLabThreadState>(createEmptyRawLabThreadState);
  const [loading, setLoading] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [handoffDismissed, setHandoffDismissed] = useState(false);
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
      const response = await streamRawLab({
        baseUrl,
        message: trimmed,
        turns: priorTurns,
        threadState,
        signal: abortController.signal,
        onChunk: (chunk) => {
          setStreamingAnswer((previous) => previous + chunk);
        }
      });

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
    setMessage("");
    setStreamingAnswer("");
    setNotice(null);
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

  const statusLine = `${formatGatewayHost(baseUrl)} · Ungrounded · ephemeral`;

  return (
    <Screen>
      <Nav />
      <View style={styles.chatPrimaryColumn}>
        <View style={styles.checklist}>
          <Text style={styles.sectionTitle}>Raw Lab</Text>
          <Text style={styles.chatInspectorStatusLine}>{statusLine}</Text>
        </View>

        <View style={styles.bannerWarning}>
          <Text style={styles.bannerWarningText}>
            Raw Lab is an unrestricted sandbox with no Life Harness authority. It is not grounded in
            your board, not saved, has no tools, and cannot change Life Harness. The app does not add
            content guardrails here — only isolation from your board.
          </Text>
        </View>

        <View style={styles.bannerInfo}>
          <Text style={styles.bannerInfoText}>
            Do not paste secrets or S3-style private data here (therapy logs, money/vice details,
            deeply personal content). Raw Lab is ungrounded and not treated as a secure vault.
          </Text>
        </View>

        <RawLabThreadMemoryPanel threadState={threadState} onThreadStateChange={setThreadState} />

        {showHandoffBanner ? (
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerInfoText}>
              This sounds like a board question. Use board context for grounded help from your
              exported snapshot.
            </Text>
            <View style={styles.splitRow}>
              <Pressable style={styles.smallButton} onPress={handleUseBoardContext}>
                <Text style={styles.smallButtonText}>Use board context</Text>
              </Pressable>
              <Pressable
                style={styles.smallButton}
                onPress={() => setHandoffDismissed(true)}
              >
                <Text style={styles.smallButtonText}>Stay in Raw Lab</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.splitRow}>
          <Pressable style={styles.smallButton} onPress={handleClearChat}>
            <Text style={styles.smallButtonText}>Clear chat</Text>
          </Pressable>
          {turns.length > 0 ? (
            <Pressable style={styles.smallButton} onPress={handleUseBoardContext}>
              <Text style={styles.smallButtonText}>Use board context</Text>
            </Pressable>
          ) : null}
          {loading ? (
            <Pressable style={styles.smallButton} onPress={handleStopStream}>
              <Text style={styles.smallButtonText}>Stop</Text>
            </Pressable>
          ) : null}
        </View>

        {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

        <View style={[styles.chatSurface, { height: chatSurfaceHeight }]}>
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
    </Screen>
  );
}
