import { type ReactNode, type RefObject, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ChatReasoningPanel } from "../chat/ChatReasoningPanel";
import { MessageActionMenu } from "../chat/MessageActionMenu";
import { ReasoningDepthPill } from "../chat/ReasoningDepthPill";
import { MemorySensitivityPicker } from "../memoryBank/MemorySensitivityPicker";
import type { QuickQuestion } from "../askHarness/ChatComposer";
import { scrollChatThreadToEnd } from "../chatSurfaceLayout";
import { styles } from "../styles";
import type { ReasoningDepth } from "../../core/chatHarnessClient";
import type { RawLabReasoningDepth, RawLabResponse } from "../../core/rawLabClient";
import { isAttachableRawLabOutput } from "../../core/rawLabOutputAttachment";
import type { RawLabTurn } from "../../core/rawLabThreadState";
import type { SensitivityLevel } from "../../core/types";
import { RawLabEmptyState } from "./RawLabEmptyState";

export interface RawLabThreadError {
  id: string;
  content: string;
}

export interface RawLabTurnDisplay {
  turn: RawLabTurn;
  response?: RawLabResponse;
}

interface RawLabThreadProps {
  turns: RawLabTurnDisplay[];
  errors?: RawLabThreadError[];
  threadScrollRef?: RefObject<ScrollView | null>;
  loading?: boolean;
  reasoningDepth?: RawLabReasoningDepth;
  streamingDraft?: string;
  onSelectPrompt?: (item: QuickQuestion) => void;
  onPin?: (content: string) => void;
  onDoNotRepeat?: (content: string) => void;
  onOpenLoop?: (content: string) => void;
  onAddVoiceTrait?: (content: string) => void;
  onAddConversationalInstinct?: (content: string) => void;
  onAddRecurringInterest?: (content: string) => void;
  onAddUserRespondsWellTo?: (content: string) => void;
  onAddUserDislike?: (content: string) => void;
  onSetCurrentStance?: (content: string) => void;
  onCaptureAsIdea?: (content: string) => void;
  onSaveAsMemory?: (content: string, sensitivity: SensitivityLevel) => void;
  onCopyForCompanion?: (content: string) => void;
}

function visibleRawLabReasoningDepth(
  reasoningDepth?: RawLabReasoningDepth
): ReasoningDepth | undefined {
  return reasoningDepth === "deep_plus" ? undefined : reasoningDepth;
}

function BubbleActions({
  content,
  trailing,
  onPin,
  onDoNotRepeat,
  onOpenLoop,
  onAddVoiceTrait,
  onAddConversationalInstinct,
  onAddRecurringInterest,
  onAddUserRespondsWellTo,
  onAddUserDislike,
  onSetCurrentStance
}: {
  content: string;
  trailing?: ReactNode;
  onPin?: (content: string) => void;
  onDoNotRepeat?: (content: string) => void;
  onOpenLoop?: (content: string) => void;
  onAddVoiceTrait?: (content: string) => void;
  onAddConversationalInstinct?: (content: string) => void;
  onAddRecurringInterest?: (content: string) => void;
  onAddUserRespondsWellTo?: (content: string) => void;
  onAddUserDislike?: (content: string) => void;
  onSetCurrentStance?: (content: string) => void;
}) {
  const hasThreadActions = onPin || onDoNotRepeat || onOpenLoop;
  const hasPersonalityActions =
    onAddVoiceTrait ||
    onAddConversationalInstinct ||
    onAddRecurringInterest ||
    onAddUserRespondsWellTo ||
    onAddUserDislike ||
    onSetCurrentStance;

  if (!hasThreadActions && !hasPersonalityActions) {
    return null;
  }

  return (
    <MessageActionMenu trailing={trailing}>
      {onPin ? (
        <Pressable style={styles.chatBubbleToggle} onPress={() => onPin(content)}>
          <Text style={styles.chatBubbleToggleText}>Pin</Text>
        </Pressable>
      ) : null}
      {onDoNotRepeat ? (
        <Pressable style={styles.chatBubbleToggle} onPress={() => onDoNotRepeat(content)}>
          <Text style={styles.chatBubbleToggleText}>Do not repeat</Text>
        </Pressable>
      ) : null}
      {onOpenLoop ? (
        <Pressable style={styles.chatBubbleToggle} onPress={() => onOpenLoop(content)}>
          <Text style={styles.chatBubbleToggleText}>Open loop</Text>
        </Pressable>
      ) : null}
      {onAddVoiceTrait ? (
        <Pressable style={styles.chatBubbleToggle} onPress={() => onAddVoiceTrait(content)}>
          <Text style={styles.chatBubbleToggleText}>Voice trait</Text>
        </Pressable>
      ) : null}
      {onAddConversationalInstinct ? (
        <Pressable
          style={styles.chatBubbleToggle}
          onPress={() => onAddConversationalInstinct(content)}
        >
          <Text style={styles.chatBubbleToggleText}>Instinct</Text>
        </Pressable>
      ) : null}
      {onAddRecurringInterest ? (
        <Pressable
          style={styles.chatBubbleToggle}
          onPress={() => onAddRecurringInterest(content)}
        >
          <Text style={styles.chatBubbleToggleText}>Interest</Text>
        </Pressable>
      ) : null}
      {onAddUserRespondsWellTo ? (
        <Pressable
          style={styles.chatBubbleToggle}
          onPress={() => onAddUserRespondsWellTo(content)}
        >
          <Text style={styles.chatBubbleToggleText}>Likes this</Text>
        </Pressable>
      ) : null}
      {onAddUserDislike ? (
        <Pressable style={styles.chatBubbleToggle} onPress={() => onAddUserDislike(content)}>
          <Text style={styles.chatBubbleToggleText}>Avoid this</Text>
        </Pressable>
      ) : null}
      {onSetCurrentStance ? (
        <Pressable style={styles.chatBubbleToggle} onPress={() => onSetCurrentStance(content)}>
          <Text style={styles.chatBubbleToggleText}>Stance</Text>
        </Pressable>
      ) : null}
    </MessageActionMenu>
  );
}

function SpineAttachmentActions({
  content,
  onCaptureAsIdea,
  onSaveAsMemory,
  onCopyForCompanion
}: {
  content: string;
  onCaptureAsIdea?: (content: string) => void;
  onSaveAsMemory?: (content: string, sensitivity: SensitivityLevel) => void;
  onCopyForCompanion?: (content: string) => void;
}) {
  const [selectedSensitivity, setSelectedSensitivity] = useState<SensitivityLevel | null>(null);

  if (!onCaptureAsIdea && !onSaveAsMemory && !onCopyForCompanion) {
    return null;
  }

  const attachable = isAttachableRawLabOutput(content);

  return (
    <View style={styles.splitRow}>
      {onCaptureAsIdea ? (
        <Pressable
          style={styles.smallButton}
          disabled={!attachable}
          onPress={() => {
            if (attachable) {
              onCaptureAsIdea(content);
            }
          }}
        >
          <Text style={styles.smallButtonText}>Capture as idea</Text>
        </Pressable>
      ) : null}
      {onSaveAsMemory ? (
        <View style={{ gap: 4 }}>
          <MemorySensitivityPicker
            value={selectedSensitivity}
            onChange={setSelectedSensitivity}
            label="Memory sensitivity (required)"
          />
          <Pressable
            style={[
              styles.smallButton,
              !attachable || !selectedSensitivity ? { opacity: 0.45 } : null
            ]}
            disabled={!attachable || !selectedSensitivity}
            onPress={() => {
              if (attachable && selectedSensitivity) {
                onSaveAsMemory(content, selectedSensitivity);
                setSelectedSensitivity(null);
              }
            }}
          >
            <Text style={styles.smallButtonText}>Save as memory</Text>
          </Pressable>
        </View>
      ) : null}
      {onCopyForCompanion ? (
        <Pressable
          style={styles.smallButton}
          disabled={!attachable}
          onPress={() => {
            if (attachable) {
              onCopyForCompanion(content);
            }
          }}
        >
          <Text style={styles.smallButtonText}>Copy for Companion</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AssistantTurn({
  content,
  reasoningDepth,
  response,
  onCaptureAsIdea,
  onSaveAsMemory,
  onCopyForCompanion,
  ...actionProps
}: {
  content: string;
  reasoningDepth?: RawLabReasoningDepth;
  response?: RawLabResponse;
  onCaptureAsIdea?: (content: string) => void;
  onSaveAsMemory?: (content: string, sensitivity: SensitivityLevel) => void;
  onCopyForCompanion?: (content: string) => void;
  onPin?: (content: string) => void;
  onDoNotRepeat?: (content: string) => void;
  onOpenLoop?: (content: string) => void;
  onAddVoiceTrait?: (content: string) => void;
  onAddConversationalInstinct?: (content: string) => void;
  onAddRecurringInterest?: (content: string) => void;
  onAddUserRespondsWellTo?: (content: string) => void;
  onAddUserDislike?: (content: string) => void;
  onSetCurrentStance?: (content: string) => void;
}) {
  const [showSafety, setShowSafety] = useState(false);
  const safetyNotes = response?.safety_notes ?? [];
  const visibleReasoningDepth = visibleRawLabReasoningDepth(reasoningDepth);

  return (
    <View style={[styles.chatBubbleAssistant, styles.chatBubbleAssistantRawSignal]}>
      <Text style={styles.chatSpeakerLabel}>Raw Signal</Text>
      <Text style={styles.chatAnswerText}>{content}</Text>
      <SpineAttachmentActions
        content={content}
        onCaptureAsIdea={onCaptureAsIdea}
        onSaveAsMemory={onSaveAsMemory}
        onCopyForCompanion={onCopyForCompanion}
      />
      <BubbleActions
        content={content}
        trailing={
          visibleReasoningDepth ? (
            <ReasoningDepthPill depth={visibleReasoningDepth} variant="rawSignal" />
          ) : undefined
        }
        {...actionProps}
      />
      {safetyNotes.length > 0 ? (
        <View style={styles.checklist}>
          <Pressable style={styles.chatBubbleToggle} onPress={() => setShowSafety((open) => !open)}>
            <Text style={styles.chatBubbleToggleText}>
              {showSafety ? "Hide safety notes" : "Safety notes"}
            </Text>
          </Pressable>
          {showSafety
            ? safetyNotes.map((note) => (
                <Text key={note} style={styles.helpText}>
                  {note}
                </Text>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

export function RawLabThread({
  turns,
  errors = [],
  threadScrollRef,
  loading = false,
  reasoningDepth = "fast",
  streamingDraft = "",
  onSelectPrompt,
  onPin,
  onDoNotRepeat,
  onOpenLoop,
  onAddVoiceTrait,
  onAddConversationalInstinct,
  onAddRecurringInterest,
  onAddUserRespondsWellTo,
  onAddUserDislike,
  onSetCurrentStance,
  onCaptureAsIdea,
  onSaveAsMemory,
  onCopyForCompanion
}: RawLabThreadProps) {
  const itemCount = turns.length + errors.length;
  const actionProps = {
    onPin,
    onDoNotRepeat,
    onOpenLoop,
    onAddVoiceTrait,
    onAddConversationalInstinct,
    onAddRecurringInterest,
    onAddUserRespondsWellTo,
    onAddUserDislike,
    onSetCurrentStance
  };
  const spineAttachmentProps = {
    onCaptureAsIdea,
    onSaveAsMemory,
    onCopyForCompanion
  };
  const visibleReasoningDepth = visibleRawLabReasoningDepth(reasoningDepth);

  useEffect(() => {
    if (itemCount === 0) {
      return;
    }

    scrollChatThreadToEnd(threadScrollRef);
  }, [itemCount, loading, streamingDraft, threadScrollRef]);

  if (itemCount === 0) {
    return (
      <View style={styles.chatThreadScroll}>
        {onSelectPrompt ? <RawLabEmptyState onSelectPrompt={onSelectPrompt} /> : null}
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
      {turns.map(({ turn, response }) => {
        if (turn.role === "user") {
          return (
            <View key={turn.id} style={styles.chatBubbleUser}>
              <Text style={styles.chatSpeakerLabel}>You</Text>
              <Text style={styles.chatUserText}>{turn.content}</Text>
              <BubbleActions content={turn.content} {...actionProps} />
            </View>
          );
        }

        return (
          <AssistantTurn
            key={turn.id}
            content={turn.content}
            reasoningDepth={turn.reasoningDepth}
            response={response}
            {...actionProps}
            {...spineAttachmentProps}
          />
        );
      })}
      {errors.map((error) => (
        <View key={error.id} style={styles.chatBubbleError}>
          <Text style={styles.chatSpeakerLabel}>Couldn&apos;t reach Raw Signal</Text>
          <Text style={styles.bodyText}>
            Your message is still here — check the gateway and try again.
          </Text>
          <Text style={styles.helpText}>{error.content}</Text>
        </View>
      ))}
      {visibleReasoningDepth ? (
        <ChatReasoningPanel
          visible={loading}
          reasoningDepth={visibleReasoningDepth}
          streamingStarted={streamingDraft.length > 0}
        />
      ) : null}
      {loading && streamingDraft ? (
        <View style={[styles.chatBubbleAssistant, styles.chatBubbleAssistantRawSignal]}>
          <Text style={styles.chatSpeakerLabel}>Raw Signal</Text>
          <Text style={styles.chatAnswerText}>{streamingDraft}</Text>
          <View style={styles.chatBubbleFooter}>
            <View />
            <View style={styles.chatBubbleFooterTrailing}>
              {visibleReasoningDepth ? (
                <ReasoningDepthPill depth={visibleReasoningDepth} variant="rawSignal" />
              ) : null}
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
