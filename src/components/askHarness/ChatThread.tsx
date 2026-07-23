import { type RefObject, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import {
  AssistantActionProposalCard,
  type ProposalUiStatus
} from "../assistantActions/AssistantActionProposalCard";
import { MessageActionMenu } from "../chat/MessageActionMenu";
import { scrollChatThreadToEnd } from "../chatSurfaceLayout";
import { styles } from "../styles";
import type { LifeHarnessData } from "../../core/actions";
import {
  buildAssistantProposalId,
  diagnoseAssistantActionParse,
  parseAssistantProposedActions,
  stripAssistantActionBlocks,
  validateAssistantAction
} from "../../core/assistantActionRegistry";
import type { AssistantProposedAction } from "../../core/assistantActionRegistry";
import { routeCapabilities } from "../../core/capabilityRouter";
import { buildChatSummary } from "../../core/harnessMemory";
import {
  buildMemoryCandidatesFromChatSummary,
  memoryItemDedupeKey,
  type MemoryItemCandidate
} from "../../core/harnessMemoryBank";
import {
  RESPONSE_VARIANTS,
  RESPONSE_VARIANTS_PRIMARY_COUNT
} from "../../core/chatThreadState";
import type { HarnessChatSummary, HarnessMemoryItem, SensitivityLevel } from "../../core/types";
import { MemorySensitivityPicker } from "../memoryBank/MemorySensitivityPicker";
import { ChatEmptyState } from "./ChatEmptyState";
import type { QuickQuestion } from "./ChatComposer";
import type { ChatThreadItem } from "./types";

interface ChatThreadProps {
  thread: ChatThreadItem[];
  threadScrollRef?: RefObject<ScrollView | null>;
  loading?: boolean;
  memoryItems: HarnessMemoryItem[];
  lifeHarnessData?: LifeHarnessData;
  sensitivity?: SensitivityLevel;
  proposalStatuses?: Record<string, ProposalUiStatus>;
  onApproveProposal?: (proposalId: string, action: AssistantProposedAction) => void;
  onDismissProposal?: (proposalId: string) => void;
  onSelectPrompt?: (item: QuickQuestion) => void;
  onToggleConfidence: (turnId: string) => void;
  onToggleMemoryTools: (turnId: string) => void;
  onToggleMemoryPreview: (turnId: string) => void;
  onSaveChatSummary: (turnId: string, summary: HarnessChatSummary) => void;
  onSaveMemoryBankCandidate: (
    turnId: string,
    candidate: MemoryItemCandidate,
    sensitivity: SensitivityLevel
  ) => void;
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

function MemoryCandidateCard({
  turnId,
  candidate,
  onSave
}: {
  turnId: string;
  candidate: MemoryItemCandidate;
  onSave: (
    turnId: string,
    candidate: MemoryItemCandidate,
    sensitivity: SensitivityLevel
  ) => void;
}) {
  const [selectedSensitivity, setSelectedSensitivity] = useState<SensitivityLevel | null>(null);

  return (
    <View style={styles.checklist}>
      <Text style={styles.helpText}>
        {candidate.kind} · {candidate.title}
      </Text>
      <Text style={styles.helpText}>{candidate.summary}</Text>
      <MemorySensitivityPicker
        value={selectedSensitivity}
        onChange={setSelectedSensitivity}
        label="Classify before saving"
      />
      <Pressable
        style={[styles.smallButton, !selectedSensitivity ? { opacity: 0.45 } : null]}
        disabled={!selectedSensitivity}
        onPress={() => {
          if (selectedSensitivity) {
            onSave(turnId, candidate, selectedSensitivity);
          }
        }}
      >
        <Text style={styles.smallButtonText}>Save to Memory Bank</Text>
      </Pressable>
    </View>
  );
}

function AssistantTurn({
  turn,
  memoryItems,
  lifeHarnessData,
  sensitivity = "S1",
  proposalStatuses,
  onApproveProposal,
  onDismissProposal,
  onToggleConfidence,
  onToggleMemoryTools,
  onToggleMemoryPreview,
  onSaveChatSummary,
  onSaveMemoryBankCandidate,
  onVariantPrompt
}: {
  turn: Extract<ChatThreadItem, { kind: "assistant" }>;
  memoryItems: HarnessMemoryItem[];
  lifeHarnessData?: LifeHarnessData;
  sensitivity?: SensitivityLevel;
  proposalStatuses?: Record<string, ProposalUiStatus>;
  onApproveProposal?: (proposalId: string, action: AssistantProposedAction) => void;
  onDismissProposal?: (proposalId: string) => void;
  onToggleConfidence: (turnId: string) => void;
  onToggleMemoryTools: (turnId: string) => void;
  onToggleMemoryPreview: (turnId: string) => void;
  onSaveChatSummary: (turnId: string, summary: HarnessChatSummary) => void;
  onSaveMemoryBankCandidate: (
    turnId: string,
    candidate: MemoryItemCandidate,
    sensitivity: SensitivityLevel
  ) => void;
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
  const displayAnswer = stripAssistantActionBlocks(turn.response.answer);
  const actionParseDiagnosis = useMemo(
    () => diagnoseAssistantActionParse(turn.response.answer),
    [turn.response.answer]
  );
  const proposedActions = useMemo(
    () => parseAssistantProposedActions(turn.response.answer),
    [turn.response.answer]
  );
  const turnRouting = useMemo(
    () =>
      routeCapabilities({
        route: "companion",
        message: turn.userText,
        mode: turn.mode,
        sensitivity
      }),
    [turn.userText, turn.mode, sensitivity]
  );
  const proposalEntries = useMemo(() => {
    if (!lifeHarnessData) {
      return [];
    }
    return proposedActions.map((action, actionIndex) => {
      const proposalId = buildAssistantProposalId(turn.id, actionIndex, action);
      const validation = validateAssistantAction(lifeHarnessData, action, turnRouting);
      return {
        proposalId,
        action,
        preview: validation.ok ? validation.preview : undefined,
        validationError: validation.ok ? undefined : validation.error,
        status: proposalStatuses?.[proposalId] ?? "pending"
      };
    });
  }, [lifeHarnessData, proposedActions, proposalStatuses, turn.id, turnRouting]);

  return (
    <View style={[styles.chatBubbleAssistant, styles.chatBubbleAssistantCompanion]}>
      <Text style={styles.chatSpeakerLabel}>Harness</Text>
      <Text style={styles.chatAnswerText}>{displayAnswer}</Text>
      {actionParseDiagnosis.parsedCount > 0 ? (
        <Text style={styles.helpText}>
          Suggested actions: {actionParseDiagnosis.parsedCount}
        </Text>
      ) : actionParseDiagnosis.hasFence && actionParseDiagnosis.parsedCount === 0 ? (
        <Text style={styles.helpText}>
          Action block found, but no valid actions could be parsed.
        </Text>
      ) : null}
      {proposalEntries.length > 0 ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          {proposalEntries.map((entry) => (
            <AssistantActionProposalCard
              key={entry.proposalId}
              action={entry.action}
              preview={entry.preview}
              validationError={entry.validationError}
              status={entry.status}
              onApprove={() => onApproveProposal?.(entry.proposalId, entry.action)}
              onDismiss={() => onDismissProposal?.(entry.proposalId)}
            />
          ))}
        </View>
      ) : null}
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
      <MessageActionMenu>
        <Pressable style={styles.chatBubbleToggle} onPress={() => onToggleMemoryTools(turn.id)}>
          <Text style={styles.chatBubbleToggleText}>
            {turn.showMemoryTools ? "Hide memory" : "Memory"}
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
                    <MemoryCandidateCard
                      key={key}
                      turnId={turn.id}
                      candidate={candidate}
                      onSave={onSaveMemoryBankCandidate}
                    />
                  );
                })}
              </View>
            ) : null}
          </>
        ) : null}
      </MessageActionMenu>
    </View>
  );
}

export function ChatThread({
  thread,
  threadScrollRef,
  loading = false,
  memoryItems,
  lifeHarnessData,
  sensitivity = "S1",
  proposalStatuses,
  onApproveProposal,
  onDismissProposal,
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
              <Text style={styles.chatSpeakerLabel}>Couldn&apos;t reach Companion</Text>
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
            lifeHarnessData={lifeHarnessData}
            sensitivity={sensitivity}
            proposalStatuses={proposalStatuses}
            onApproveProposal={onApproveProposal}
            onDismissProposal={onDismissProposal}
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
