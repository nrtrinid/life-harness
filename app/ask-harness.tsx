import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import {
  ANDROID_EMULATOR_CHAT_HARNESS_URL,
  askChatHarness,
  ChatHarnessError,
  DEFAULT_CHAT_HARNESS_URL,
  PHYSICAL_DEVICE_URL_HINT
} from "../src/core/chatHarnessClient";
import {
  AUTO_COMPACT_THRESHOLD_CHARS,
  buildCompactHarnessContext,
  buildContextQualitySummary,
  buildHarnessContext,
  estimateHarnessContextChars,
  getActiveLimitSignal,
  type ChatHarnessMode,
  type ChatHarnessResponse,
  type HarnessExportInput
} from "../src/core/harnessContext";
import { buildChatSummary } from "../src/core/harnessMemory";
import type { SensitivityLevel } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const MODES: ChatHarnessMode[] = ["general", "operator", "reflection", "builder"];
const SENSITIVITIES: SensitivityLevel[] = ["S0", "S1", "S2", "S3"];

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

type ContextExportMode = "full" | "compact";

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

  return input;
}

export default function AskHarnessDevScreen() {
  const harnessState = useLifeHarness();
  const { saveChatSummary, deleteChatSummary } = harnessState;
  const [baseUrl, setBaseUrl] = useState(DEFAULT_CHAT_HARNESS_URL);
  const [mode, setMode] = useState<ChatHarnessMode>("general");
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>("S1");
  const [message, setMessage] = useState("What am I avoiding right now?");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [response, setResponse] = useState<ChatHarnessResponse | null>(null);
  const [savedMemoryKey, setSavedMemoryKey] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const exportInput = useMemo(() => buildExportInput(harnessState), [harnessState]);
  const fullContext = useMemo(() => buildHarnessContext(exportInput), [exportInput]);
  const compactContext = useMemo(() => buildCompactHarnessContext(exportInput), [exportInput]);
  const fullChars = useMemo(() => estimateHarnessContextChars(fullContext), [fullContext]);
  const compactChars = useMemo(() => estimateHarnessContextChars(compactContext), [compactContext]);
  const defaultContextMode: ContextExportMode =
    fullChars > AUTO_COMPACT_THRESHOLD_CHARS ? "compact" : "full";
  const [contextMode, setContextMode] = useState<ContextExportMode>(defaultContextMode);
  const selectedContext = contextMode === "compact" ? compactContext : fullContext;
  const activeLimitSignal = useMemo(() => getActiveLimitSignal(exportInput), [exportInput]);
  const qualitySummary = useMemo(
    () =>
      buildContextQualitySummary(
        selectedContext,
        activeLimitSignal,
        harnessState.chatSummaries.length
      ),
    [selectedContext, activeLimitSignal, harnessState.chatSummaries.length]
  );
  const memoryPreview = useMemo(() => {
    if (!response) {
      return null;
    }

    return buildChatSummary({
      userMessage: message,
      assistantAnswer: response.answer,
      mode,
      confidenceNotes: response.confidence_notes,
      safetyNotes: response.safety_notes
    });
  }, [response, message, mode]);
  const currentMemoryKey = response ? `${message}::${response.answer.slice(0, 120)}` : null;
  const memoryAlreadySaved = currentMemoryKey !== null && savedMemoryKey === currentMemoryKey;
  const recentMemories = useMemo(
    () =>
      [...harnessState.chatSummaries]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 3),
    [harnessState.chatSummaries]
  );
  const [qualityOpen, setQualityOpen] = useState(false);

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

  async function handleSend() {
    setNotice(null);
    setLoading(true);

    try {
      const result = await askChatHarness({
        baseUrl,
        message,
        mode,
        sensitivity,
        context: selectedContext
      });
      setResponse(result);
      setSavedMemoryKey(null);
    } catch (error) {
      setResponse(null);
      const text =
        error instanceof ChatHarnessError
          ? error.message
          : "Could not reach Chat Harness. Check the gateway URL and try again.";
      setNotice({ kind: "error", message: text });
    } finally {
      setLoading(false);
    }
  }

  function handleSaveMemory() {
    if (!memoryPreview || memoryAlreadySaved) {
      return;
    }

    saveChatSummary(memoryPreview);
    setSavedMemoryKey(currentMemoryKey);
    setNotice({ kind: "success", message: "Chat memory saved." });
  }

  return (
    <Screen>
      <Nav />
      <Text style={styles.screenIntro}>Ask Harness Dev</Text>
      <Notice kind="info" message="Dev sandbox — sends current board context to local ai-gateway." />
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      <Section title="Gateway">
        <TextInput
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={DEFAULT_CHAT_HARNESS_URL}
          placeholderTextColor="rgba(212,216,200,0.3)"
          style={styles.captureInput}
        />
        <Text style={styles.helpText}>
          Web/desktop: {DEFAULT_CHAT_HARNESS_URL}. Android emulator: {ANDROID_EMULATOR_CHAT_HARNESS_URL}.{" "}
          {PHYSICAL_DEVICE_URL_HINT}
        </Text>
      </Section>

      <Section title="Mode">
        <View style={styles.splitRow}>
          {MODES.map((option) => (
            <Pressable
              key={option}
              style={mode === option ? styles.navButtonActive : styles.smallButton}
              onPress={() => setMode(option)}
            >
              <Text style={styles.smallButtonText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="Sensitivity">
        <View style={styles.splitRow}>
          {SENSITIVITIES.map((option) => (
            <Pressable
              key={option}
              style={sensitivity === option ? styles.navButtonActive : styles.smallButton}
              onPress={() => setSensitivity(option)}
            >
              <Text style={styles.smallButtonText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="Message">
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Ask the scout…"
          placeholderTextColor="rgba(212,216,200,0.3)"
          style={[styles.captureInput, { minHeight: 96 }]}
        />
        <View style={styles.splitRow}>
          {QUICK_QUESTIONS.map((item) => (
            <Pressable
              key={item.label}
              style={styles.smallButton}
              onPress={() => {
                setMessage(item.message);
                setMode(item.mode);
              }}
            >
              <Text style={styles.smallButtonText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={styles.primaryAction}
          disabled={loading || !message.trim()}
          onPress={() => void handleSend()}
        >
          {loading ? (
            <ActivityIndicator color="#0E100A" />
          ) : (
            <Text style={styles.primaryActionText}>Send to Chat Harness</Text>
          )}
        </Pressable>
      </Section>

      <Section title="Exported context">
        <Text style={styles.bodyText}>
          Full: {fullChars} chars · Compact: {compactChars} chars · Sending: {contextMode}
        </Text>
        <View style={styles.splitRow}>
          {(["full", "compact"] as const).map((option) => (
            <Pressable
              key={option}
              style={contextMode === option ? styles.navButtonActive : styles.smallButton}
              onPress={() => setContextMode(option)}
            >
              <Text style={styles.smallButtonText}>{option === "full" ? "Full context" : "Compact context"}</Text>
            </Pressable>
          ))}
        </View>
        {compactChars < fullChars ? (
          <Text style={styles.helpText}>
            Compact strips resume bank cards first for gateway headroom. Use Compact for OpenVINO when full exceeds
            budget.
          </Text>
        ) : null}
        <Text style={styles.bodyText}>{qualitySummary.split("\n")[0]}</Text>
        <Pressable style={styles.smallButton} onPress={() => setQualityOpen((open) => !open)}>
          <Text style={styles.smallButtonText}>
            {qualityOpen ? "Hide context quality summary" : "Show context quality summary"}
          </Text>
        </Pressable>
        {qualityOpen ? (
          <Text style={styles.bodyText}>{qualitySummary}</Text>
        ) : null}
        <Pressable style={styles.smallButton} onPress={() => setPreviewOpen((open) => !open)}>
          <Text style={styles.smallButtonText}>{previewOpen ? "Hide JSON preview" : "Show JSON preview"}</Text>
        </Pressable>
        {previewOpen ? (
          <ScrollView horizontal>
            <Text style={[styles.bodyText, { fontFamily: "monospace" }]}>{previewText}</Text>
          </ScrollView>
        ) : null}
      </Section>

      {response ? (
        <Section title="Response">
          <Text style={styles.titleText}>{response.answer}</Text>
          <Text style={styles.bodyText}>Used context: {response.used_context ? "yes" : "no"}</Text>
          {response.confidence_notes.length > 0 ? (
            <View style={styles.checklist}>
              <Text style={styles.helpText}>Confidence notes</Text>
              {response.confidence_notes.map((note) => (
                <Text key={note} style={styles.bodyText}>
                  • {note}
                </Text>
              ))}
            </View>
          ) : null}
          {response.safety_notes.length > 0 ? (
            <View style={styles.checklist}>
              <Text style={styles.helpText}>Safety notes</Text>
              {response.safety_notes.map((note) => (
                <Text key={note} style={styles.bodyText}>
                  • {note}
                </Text>
              ))}
            </View>
          ) : null}
          {memoryPreview ? (
            <View style={styles.checklist}>
              <Text style={styles.helpText}>Preview memory</Text>
              <Text style={styles.bodyText}>Summary: {memoryPreview.assistantSummary}</Text>
              {memoryPreview.patterns.length > 0 ? (
                <Text style={styles.bodyText}>Patterns: {memoryPreview.patterns.join(", ")}</Text>
              ) : null}
              {memoryPreview.rememberForNextTime.map((item) => (
                <Text key={item} style={styles.bodyText}>
                  • Remember: {item}
                </Text>
              ))}
              {memoryPreview.decisions.length > 0 ? (
                <Text style={styles.bodyText}>Decisions: {memoryPreview.decisions.join(" · ")}</Text>
              ) : null}
              <Pressable
                style={memoryAlreadySaved ? styles.smallButton : styles.primaryAction}
                disabled={memoryAlreadySaved}
                onPress={handleSaveMemory}
              >
                <Text style={memoryAlreadySaved ? styles.smallButtonText : styles.primaryActionText}>
                  {memoryAlreadySaved ? "Chat memory saved" : "Save chat summary to memory"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </Section>
      ) : null}

      {recentMemories.length > 0 ? (
        <Section title="Recent chat memories">
          {recentMemories.map((item) => (
            <View key={item.id} style={styles.checklist}>
              <Text style={styles.bodyText}>
                {item.mode} · {item.createdAt.slice(0, 16).replace("T", " ")}
              </Text>
              <Text style={styles.bodyText}>{item.assistantSummary}</Text>
              {item.patterns.length > 0 ? (
                <Text style={styles.helpText}>Patterns: {item.patterns.join(", ")}</Text>
              ) : null}
              <Pressable style={styles.smallButton} onPress={() => deleteChatSummary(item.id)}>
                <Text style={styles.smallButtonText}>Delete</Text>
              </Pressable>
            </View>
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
