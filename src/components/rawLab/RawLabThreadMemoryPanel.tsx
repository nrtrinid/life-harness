import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  addUserDislike,
  addUserRespondsWellTo,
  clearPersonalityInThreadState,
  clearThreadMemoryOnly,
  removePersonalityItem,
  removeThreadStateItem,
  type RawLabPersonalityListKey,
  type RawLabThreadState,
  type RawLabThreadStateListKey
} from "../../core/rawLabThreadState";
import { styles } from "../styles";

const DIGEST_PREVIEW_CHARS = 160;

interface RawLabThreadMemoryPanelProps {
  threadState: RawLabThreadState;
  onThreadStateChange: (state: RawLabThreadState) => void;
  embeddedInBackroom?: boolean;
  sectionFilter?: "memory" | "style" | "both";
}

function MemoryReviewCard({
  text,
  onForget,
  onLeanInto,
  onAvoid
}: {
  text: string;
  onForget: () => void;
  onLeanInto?: () => void;
  onAvoid?: () => void;
}) {
  return (
    <View style={styles.memoryReviewCard}>
      <Text style={styles.memoryReviewCardText}>&ldquo;{text}&rdquo;</Text>
      <View style={styles.memoryReviewCardActions}>
        {onLeanInto ? (
          <Pressable style={styles.chatBubbleToggle} onPress={onLeanInto}>
            <Text style={styles.chatBubbleToggleText}>Lean into</Text>
          </Pressable>
        ) : null}
        {onAvoid ? (
          <Pressable style={styles.chatBubbleToggle} onPress={onAvoid}>
            <Text style={styles.chatBubbleToggleText}>Avoid</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.smallButton} onPress={onForget}>
          <Text style={styles.smallButtonText}>Forget</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TruncatedDigest({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncate = text.length > DIGEST_PREVIEW_CHARS;
  const visible = expanded || !needsTruncate ? text : `${text.slice(0, DIGEST_PREVIEW_CHARS)}…`;

  return (
    <View style={styles.memoryReviewCard}>
      <Text style={styles.memoryReviewCardText}>{visible}</Text>
      {needsTruncate ? (
        <Pressable onPress={() => setExpanded((open) => !open)}>
          <Text style={styles.chatBubbleToggleText}>{expanded ? "Show less" : "Show more"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MemoryItemsList({
  items,
  listKey,
  onRemove,
  onLeanInto,
  onAvoid
}: {
  items: string[];
  listKey: string;
  onRemove: (index: number) => void;
  onLeanInto?: (item: string) => void;
  onAvoid?: (item: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <>
      {items.map((item, index) => (
        <MemoryReviewCard
          key={`${listKey}-${index}`}
          text={item}
          onForget={() => onRemove(index)}
          onLeanInto={onLeanInto ? () => onLeanInto(item) : undefined}
          onAvoid={onAvoid ? () => onAvoid(item) : undefined}
        />
      ))}
    </>
  );
}

export function RawLabThreadMemoryPanel({
  threadState,
  onThreadStateChange,
  embeddedInBackroom = false,
  sectionFilter = "both"
}: RawLabThreadMemoryPanelProps) {
  const [memoryCollapsed, setMemoryCollapsed] = useState(!embeddedInBackroom);
  const [personalityCollapsed, setPersonalityCollapsed] = useState(!embeddedInBackroom);

  const { personality } = threadState;

  const hasMemoryContent =
    Boolean(threadState.recentDigest) ||
    threadState.pinnedFacts.length > 0 ||
    threadState.decisions.length > 0 ||
    threadState.openLoops.length > 0 ||
    threadState.userSteering.length > 0 ||
    threadState.doNotRepeat.length > 0;

  const hasPersonalityContent =
    personality.voiceTraits.length > 0 ||
    personality.conversationalInstincts.length > 0 ||
    personality.recurringInterests.length > 0 ||
    personality.userRespondsWellTo.length > 0 ||
    personality.userDislikes.length > 0 ||
    Boolean(personality.currentStance) ||
    personality.growthNotes.length > 0;

  function handleRemoveMemory(key: RawLabThreadStateListKey, index: number) {
    onThreadStateChange(removeThreadStateItem(threadState, key, index));
  }

  function handleRemovePersonality(key: RawLabPersonalityListKey, index: number) {
    onThreadStateChange({
      ...threadState,
      personality: removePersonalityItem(threadState.personality, key, index)
    });
  }

  function handleLeanInto(item: string) {
    onThreadStateChange({
      ...threadState,
      personality: addUserRespondsWellTo(threadState.personality, item)
    });
  }

  function handleAvoid(item: string) {
    onThreadStateChange({
      ...threadState,
      personality: addUserDislike(threadState.personality, item)
    });
  }

  const showMemory = sectionFilter === "both" || sectionFilter === "memory";
  const showStyle = sectionFilter === "both" || sectionFilter === "style";
  const memoryOpen = embeddedInBackroom || !memoryCollapsed;
  const styleOpen = embeddedInBackroom || !personalityCollapsed;

  return (
    <View style={styles.checklist}>
      {showMemory ? (
        <View style={styles.chatBackroomSection}>
          <View style={styles.splitRow}>
            <Text style={styles.sectionTitle}>This chat remembers</Text>
            {!embeddedInBackroom ? (
              <Pressable
                style={styles.smallButton}
                onPress={() => setMemoryCollapsed((open) => !open)}
              >
                <Text style={styles.smallButtonText}>{memoryCollapsed ? "Expand" : "Collapse"}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.helpText}>Temporary to this chat. Not saved to Life Harness.</Text>

          {memoryOpen ? (
            <View style={styles.checklist}>
              {threadState.recentDigest ? (
                <TruncatedDigest text={threadState.recentDigest} />
              ) : null}

              <MemoryItemsList
                items={threadState.pinnedFacts}
                listKey="pinnedFacts"
                onRemove={(index) => handleRemoveMemory("pinnedFacts", index)}
              />
              <MemoryItemsList
                items={threadState.openLoops}
                listKey="openLoops"
                onRemove={(index) => handleRemoveMemory("openLoops", index)}
              />
              <MemoryItemsList
                items={threadState.userSteering}
                listKey="userSteering"
                onRemove={(index) => handleRemoveMemory("userSteering", index)}
              />
              <MemoryItemsList
                items={threadState.doNotRepeat}
                listKey="doNotRepeat"
                onRemove={(index) => handleRemoveMemory("doNotRepeat", index)}
              />

              {hasMemoryContent ? (
                <Pressable
                  style={styles.smallButton}
                  onPress={() => onThreadStateChange(clearThreadMemoryOnly(threadState))}
                >
                  <Text style={styles.smallButtonText}>Clear thread memory</Text>
                </Pressable>
              ) : (
                <Text style={styles.helpText}>
                  Nothing pinned yet. Use message actions or keep chatting.
                </Text>
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {showStyle ? (
        <View style={styles.chatBackroomSection}>
          <View style={styles.splitRow}>
            <Text style={styles.sectionTitle}>Style in this chat</Text>
            {!embeddedInBackroom ? (
              <Pressable
                style={styles.smallButton}
                onPress={() => setPersonalityCollapsed((open) => !open)}
              >
                <Text style={styles.smallButtonText}>
                  {personalityCollapsed ? "Expand" : "Collapse"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.helpText}>Temporary. Not saved to Life Harness.</Text>

          {styleOpen ? (
            <View style={styles.checklist}>
              <MemoryItemsList
                items={personality.voiceTraits}
                listKey="voiceTraits"
                onRemove={(index) => handleRemovePersonality("voiceTraits", index)}
                onLeanInto={handleLeanInto}
                onAvoid={handleAvoid}
              />
              <MemoryItemsList
                items={personality.conversationalInstincts}
                listKey="instincts"
                onRemove={(index) => handleRemovePersonality("conversationalInstincts", index)}
              />
              <MemoryItemsList
                items={personality.recurringInterests}
                listKey="interests"
                onRemove={(index) => handleRemovePersonality("recurringInterests", index)}
              />
              <MemoryItemsList
                items={personality.userRespondsWellTo}
                listKey="respondsWell"
                onRemove={(index) => handleRemovePersonality("userRespondsWellTo", index)}
              />
              <MemoryItemsList
                items={personality.userDislikes}
                listKey="dislikes"
                onRemove={(index) => handleRemovePersonality("userDislikes", index)}
              />
              {personality.currentStance ? (
                <TruncatedDigest text={personality.currentStance} />
              ) : null}
              <MemoryItemsList
                items={personality.growthNotes}
                listKey="growth"
                onRemove={(index) => handleRemovePersonality("growthNotes", index)}
              />

              {hasPersonalityContent ? (
                <Pressable
                  style={styles.smallButton}
                  onPress={() => onThreadStateChange(clearPersonalityInThreadState(threadState))}
                >
                  <Text style={styles.smallButtonText}>Reset style</Text>
                </Pressable>
              ) : (
                <Text style={styles.helpText}>
                  Personality starts neutral. Shape it through chat steering or message actions.
                </Text>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
