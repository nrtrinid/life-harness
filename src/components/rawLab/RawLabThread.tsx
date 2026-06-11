import { type RefObject, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { MessageActionMenu } from "../chat/MessageActionMenu";
import type { QuickQuestion } from "../askHarness/ChatComposer";
import { scrollChatThreadToEnd } from "../chatSurfaceLayout";
import { styles } from "../styles";
import type { RawLabResponse } from "../../core/rawLabClient";
import { isAttachableRawLabOutput } from "../../core/rawLabOutputAttachment";
import type { RawLabTurn } from "../../core/rawLabThreadState";
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
  onSaveAsMemory?: (content: string) => void;
  onCopyForCompanion?: (content: string) => void;
}

function BubbleActions({
  content,
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
    <MessageActionMenu>
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
  onSaveAsMemory?: (content: string) => void;
  onCopyForCompanion?: (content: string) => void;
}) {
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
        <Pressable
          style={styles.smallButton}
          disabled={!attachable}
          onPress={() => {
            if (attachable) {
              onSaveAsMemory(content);
            }
          }}
        >
          <Text style={styles.smallButtonText}>Save as memory</Text>
        </Pressable>
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
  response,
  onCaptureAsIdea,
  onSaveAsMemory,
  onCopyForCompanion,
  ...actionProps
}: {
  content: string;
  response?: RawLabResponse;
  onCaptureAsIdea?: (content: string) => void;
  onSaveAsMemory?: (content: string) => void;
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

  return (
    <View style={styles.chatBubbleAssistant}>
      <Text style={styles.chatSpeakerLabel}>Raw Signal</Text>
      <Text style={styles.chatAnswerText}>{content}</Text>
      <SpineAttachmentActions
        content={content}
        onCaptureAsIdea={onCaptureAsIdea}
        onSaveAsMemory={onSaveAsMemory}
        onCopyForCompanion={onCopyForCompanion}
      />
      <BubbleActions content={content} {...actionProps} />
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
      {loading && streamingDraft ? (
        <View style={styles.chatBubbleAssistant}>
          <Text style={styles.chatSpeakerLabel}>Raw Signal</Text>
          <Text style={styles.chatAnswerText}>{streamingDraft}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
