import { type RefObject, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { scrollChatThreadToEnd } from "../chatSurfaceLayout";
import { styles } from "../styles";
import { buildChatSummary } from "../../core/harnessMemory";
import {
  buildMemoryCandidatesFromChatSummary,
  memoryItemDedupeKey
} from "../../core/harnessMemoryBank";
import {
  RESPONSE_VARIANTS,
  RESPONSE_VARIANTS_PRIMARY_COUNT
} from "../../core/chatThreadState";
import type { HarnessChatSummary, HarnessMemoryItem } from "../../core/types";
import { ChatEmptyState } from "./ChatEmptyState";
import type { QuickQuestion } from "./ChatComposer";
import type { ChatThreadItem } from "./types";

interface ChatThreadProps {
  thread: ChatThreadItem[];
  threadScrollRef?: RefObject<ScrollView | null>;
  loading?: boolean;
  memoryItems: HarnessMemoryItem[];
  onSelectPrompt?: (item: QuickQuestion) => void;
  onToggleConfidence: (turnId: string) => void;
  onToggleMemoryTools: (turnId: string) => void;
  onToggleMemoryPreview: (turnId: string) => void;
  onSaveChatSummary: (turnId: string, summary: HarnessChatSummary) => void;
  onSaveMemoryBankCandidate: (turnId: string, candidate: HarnessMemoryItem) => void;
  onVariantPrompt?: (prompt: string) => void;
}

function MetaPill({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <View style={accent ? styles.chatMetaPillAccent : styles.chatMetaPill}>
      <Text style={accent ? styles.chatMetaPillTextAccent : styles.chatMetaPillText}>{label}</Text>
    </View>
  );
}

function getMemoryCandidates(
  turn: Extract<ChatThreadItem, { kind: "assistant" }>,
  memoryItems: HarnessMemoryItem[]
) {
  if (!turn.memorySaved) {
    return [];
  }

  const summary = buildChatSummary({
    userMessage: turn.userText,
    assistantAnswer: turn.response.answer,
    mode: turn.mode,
    confidenceNotes: turn.response.confidence_notes,
    safetyNotes: turn.response.safety_notes
  });

  const savedKeys = new Set(turn.savedCandidateKeys);
  return buildMemoryCandidatesFromChatSummary(summary, memoryItems).filter(
    (candidate) => !savedKeys.has(memoryItemDedupeKey(candidate))
  );
}

function AssistantTurn({
  turn,
  memoryItems,
  onToggleConfidence,
  onToggleMemoryTools,
  onToggleMemoryPreview,
  onSaveChatSummary,
  onSaveMemoryBankCandidate,
  onVariantPrompt
}: {
  turn: Extract<ChatThreadItem, { kind: "assistant" }>;
  memoryItems: HarnessMemoryItem[];
  onToggleConfidence: (turnId: string) => void;
  onToggleMemoryTools: (turnId: string) => void;
  onToggleMemoryPreview: (turnId: string) => void;
  onSaveChatSummary: (turnId: string, summary: HarnessChatSummary) => void;
  onSaveMemoryBankCandidate: (turnId: string, candidate: HarnessMemoryItem) => void;
  onVariantPrompt?: (prompt: string) => void;
}) {
  const [showSafety, setShowSafety] = useState(false);
  const [showVariantOverflow, setShowVariantOverflow] = useState(false);
  const { width } = useWindowDimensions();
  const narrowVariants = width < 520;
  const visibleVariants = narrowVariants && !showVariantOverflow
    ? RESPONSE_VARIANTS.slice(0, RESPONSE_VARIANTS_PRIMARY_COUNT)
    : RESPONSE_VARIANTS;
  const memoryPreview = buildChatSummary({
    userMessage: turn.userText,
    assistantAnswer: turn.response.answer,
    mode: turn.mode,
    confidenceNotes: turn.response.confidence_notes,
    safetyNotes: turn.response.safety_notes
  });
  const candidates = getMemoryCandidates(turn, memoryItems);

  return (
    <View style={styles.chatBubbleAssistant}>
      <Text style={styles.chatSpeakerLabel}>Harness</Text>
      <Text style={styles.chatAnswerText}>{turn.response.answer}</Text>
      <View style={styles.chatMetaRow}>
        <MetaPill
          label={`Context ${turn.response.used_context ? "yes" : "no"}`}
          accent={turn.response.used_context}
        />
        <MetaPill label={turn.mode} />
        {turn.memorySaved ? <MetaPill label="Memory saved" accent /> : null}
      </View>
      {turn.response.safety_notes.length > 0 ? (
        <View style={styles.checklist}>
          <Pressable style={styles.chatBubbleToggle} onPress={() => setShowSafety((open) => !open)}>
            <Text style={styles.chatBubbleToggleText}>
              {showSafety ? "Hide safety notes" : "Safety notes"}
            </Text>
          </Pressable>
          {showSafety
            ? turn.response.safety_notes.map((note) => (
                <Text key={note} style={styles.helpText}>
                  {note}
                </Text>
              ))
            : null}
        </View>
      ) : null}
      {turn.response.confidence_notes.length > 0 ? (
        <View style={styles.checklist}>
          <Pressable style={styles.chatBubbleToggle} onPress={() => onToggleConfidence(turn.id)}>
            <Text style={styles.chatBubbleToggleText}>
              {turn.showConfidence ? "Hide confidence" : "Confidence"}
            </Text>
          </Pressable>
          {turn.showConfidence
            ? turn.response.confidence_notes.map((note) => (
                <Text key={note} style={styles.helpText}>
                  {note}
                </Text>
              ))
            : null}
        </View>
      ) : null}
      {onVariantPrompt ? (
        <View style={styles.splitRow}>
          {visibleVariants.map((variant) => (
            <Pressable
              key={variant.label}
              style={styles.chatBubbleToggle}
              onPress={() => onVariantPrompt(variant.prompt)}
            >
              <Text style={styles.chatBubbleToggleText}>{variant.label}</Text>
            </Pressable>
          ))}
          {narrowVariants ? (
            <Pressable
              style={styles.chatBubbleToggle}
              onPress={() => setShowVariantOverflow((open) => !open)}
            >
              <Text style={styles.chatBubbleToggleText}>
                {showVariantOverflow ? "Fewer" : "More"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={styles.chatMemoryTools}>
        <Pressable style={styles.chatBubbleToggle} onPress={() => onToggleMemoryTools(turn.id)}>
          <Text style={styles.chatBubbleToggleText}>
            {turn.showMemoryTools ? "Hide memory tools" : "Memory tools"}
          </Text>
        </Pressable>
        {turn.showMemoryTools ? (
          <>
            <Pressable style={styles.chatBubbleToggle} onPress={() => onToggleMemoryPreview(turn.id)}>
              <Text style={styles.chatBubbleToggleText}>
                {turn.showMemoryPreview ? "Hide preview" : "Preview memory"}
              </Text>
            </Pressable>
            {turn.showMemoryPreview ? (
              <>
                <Text style={styles.helpText}>{memoryPreview.assistantSummary}</Text>
                {memoryPreview.patterns.length > 0 ? (
                  <Text style={styles.helpText}>Patterns: {memoryPreview.patterns.join(", ")}</Text>
                ) : null}
              </>
            ) : null}
            {turn.memorySaved ? (
              <MetaPill label="Chat memory saved" accent />
            ) : (
              <Pressable style={styles.smallButton} onPress={() => onSaveChatSummary(turn.id, memoryPreview)}>
                <Text style={styles.smallButtonText}>Save chat summary</Text>
              </Pressable>
            )}
            {turn.memorySaved && candidates.length > 0 ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={styles.helpText}>Suggested durable memories</Text>
                {candidates.map((candidate) => {
                  const key = memoryItemDedupeKey(candidate);
                  return (
                    <View key={key} style={styles.checklist}>
                      <Text style={styles.helpText}>
                        {candidate.kind} · {candidate.title}
                      </Text>
                      <Text style={styles.helpText}>{candidate.summary}</Text>
                      <Pressable
                        style={styles.smallButton}
                        onPress={() => onSaveMemoryBankCandidate(turn.id, candidate)}
                      >
                        <Text style={styles.smallButtonText}>Save to Memory Bank</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

export function ChatThread({
  thread,
  threadScrollRef,
  loading = false,
  memoryItems,
  onSelectPrompt,
  onToggleConfidence,
  onToggleMemoryTools,
  onToggleMemoryPreview,
  onSaveChatSummary,
  onSaveMemoryBankCandidate,
  onVariantPrompt
}: ChatThreadProps) {
  useEffect(() => {
    if (thread.length === 0) {
      return;
    }

    scrollChatThreadToEnd(threadScrollRef);
  }, [thread.length, loading, threadScrollRef]);

  if (thread.length === 0) {
    return (
      <View style={styles.chatThreadScroll}>
        {onSelectPrompt ? <ChatEmptyState onSelectPrompt={onSelectPrompt} /> : null}
      </View>
    );
  }

  return (
    <ScrollView
      ref={threadScrollRef}
      style={styles.chatThreadScroll}
      contentContainerStyle={styles.chatThreadContent}
      onContentSizeChange={() => scrollChatThreadToEnd(threadScrollRef)}
    >
      {thread.map((item) => {
        if (item.kind === "user") {
          return (
            <View key={item.id} style={styles.chatBubbleUser}>
              <Text style={styles.chatSpeakerLabel}>You</Text>
              <Text style={styles.chatUserText}>{item.text}</Text>
            </View>
          );
        }

        if (item.kind === "error") {
          return (
            <View key={item.id} style={styles.chatBubbleError}>
              <Text style={styles.chatSpeakerLabel}>Couldn&apos;t reach Harness</Text>
              <Text style={styles.bodyText}>
                Your message is still here — check the gateway and try again.
              </Text>
              <Text style={styles.helpText}>{item.text}</Text>
              <Text style={styles.helpText}>
                Gateway: {item.baseUrl} · Context: {item.contextMode}
                {item.status ? ` · HTTP ${item.status}` : ""}
              </Text>
            </View>
          );
        }

        return (
          <AssistantTurn
            key={item.id}
            turn={item}
            memoryItems={memoryItems}
            onToggleConfidence={onToggleConfidence}
            onToggleMemoryTools={onToggleMemoryTools}
            onToggleMemoryPreview={onToggleMemoryPreview}
            onSaveChatSummary={onSaveChatSummary}
            onSaveMemoryBankCandidate={onSaveMemoryBankCandidate}
            onVariantPrompt={onVariantPrompt}
          />
        );
      })}
    </ScrollView>
  );
}
