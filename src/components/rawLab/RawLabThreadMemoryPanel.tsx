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

interface RawLabThreadMemoryPanelProps {
  threadState: RawLabThreadState;
  onThreadStateChange: (state: RawLabThreadState) => void;
}

function ListSection({
  title,
  items,
  onRemove,
  onLeanInto,
  onAvoid,
  listKey
}: {
  title: string;
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
    <View style={styles.checklist}>
      <Text style={styles.helpText}>{title}</Text>
      {items.map((item, index) => (
        <View key={`${listKey}-${index}`} style={styles.checklist}>
          <Text style={styles.bodyText}>{item}</Text>
          <View style={styles.splitRow}>
            {onLeanInto ? (
              <Pressable style={styles.chatBubbleToggle} onPress={() => onLeanInto(item)}>
                <Text style={styles.chatBubbleToggleText}>Lean into this</Text>
              </Pressable>
            ) : null}
            {onAvoid ? (
              <Pressable style={styles.chatBubbleToggle} onPress={() => onAvoid(item)}>
                <Text style={styles.chatBubbleToggleText}>Avoid this</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.smallButton} onPress={() => onRemove(index)}>
              <Text style={styles.smallButtonText}>Forget this</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

export function RawLabThreadMemoryPanel({
  threadState,
  onThreadStateChange
}: RawLabThreadMemoryPanelProps) {
  const [memoryCollapsed, setMemoryCollapsed] = useState(true);
  const [personalityCollapsed, setPersonalityCollapsed] = useState(true);

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

  return (
    <View style={styles.checklist}>
      <View style={styles.bannerInfo}>
        <View style={styles.splitRow}>
          <Text style={styles.sectionTitle}>What this chat remembers</Text>
          <Pressable
            style={styles.smallButton}
            onPress={() => setMemoryCollapsed((open) => !open)}
          >
            <Text style={styles.smallButtonText}>{memoryCollapsed ? "Expand" : "Collapse"}</Text>
          </Pressable>
        </View>
        <Text style={styles.bannerInfoText}>
          Temporary to this chat. Not saved to Life Harness.
        </Text>

        {!memoryCollapsed ? (
          <View style={styles.checklist}>
            {threadState.recentDigest ? (
              <View style={styles.checklist}>
                <Text style={styles.helpText}>Recent digest (extractive snippet)</Text>
                <Text style={styles.bodyText}>{threadState.recentDigest}</Text>
              </View>
            ) : null}

            <ListSection
              title="Pinned facts"
              items={threadState.pinnedFacts}
              listKey="pinnedFacts"
              onRemove={(index) => handleRemoveMemory("pinnedFacts", index)}
            />
            <ListSection
              title="Decisions"
              items={threadState.decisions}
              listKey="decisions"
              onRemove={(index) => handleRemoveMemory("decisions", index)}
            />
            <ListSection
              title="Open loops"
              items={threadState.openLoops}
              listKey="openLoops"
              onRemove={(index) => handleRemoveMemory("openLoops", index)}
            />
            <ListSection
              title="Tone preferences"
              items={threadState.userSteering}
              listKey="userSteering"
              onRemove={(index) => handleRemoveMemory("userSteering", index)}
            />
            <ListSection
              title="Do-not-repeat notes"
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
              <Text style={styles.helpText}>Nothing pinned yet. Use message actions or keep chatting.</Text>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.bannerInfo}>
        <View style={styles.splitRow}>
          <Text style={styles.sectionTitle}>Personality forming in this chat</Text>
          <Pressable
            style={styles.smallButton}
            onPress={() => setPersonalityCollapsed((open) => !open)}
          >
            <Text style={styles.smallButtonText}>
              {personalityCollapsed ? "Expand" : "Collapse"}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.bannerInfoText}>Temporary. Not saved to Life Harness.</Text>

        {!personalityCollapsed ? (
          <View style={styles.checklist}>
            <ListSection
              title="Voice traits"
              items={personality.voiceTraits}
              listKey="voiceTraits"
              onRemove={(index) => handleRemovePersonality("voiceTraits", index)}
              onLeanInto={handleLeanInto}
              onAvoid={handleAvoid}
            />
            <ListSection
              title="Conversational instincts"
              items={personality.conversationalInstincts}
              listKey="instincts"
              onRemove={(index) => handleRemovePersonality("conversationalInstincts", index)}
            />
            <ListSection
              title="Recurring interests"
              items={personality.recurringInterests}
              listKey="interests"
              onRemove={(index) => handleRemovePersonality("recurringInterests", index)}
            />
            <ListSection
              title="User responds well to"
              items={personality.userRespondsWellTo}
              listKey="respondsWell"
              onRemove={(index) => handleRemovePersonality("userRespondsWellTo", index)}
            />
            <ListSection
              title="User dislikes"
              items={personality.userDislikes}
              listKey="dislikes"
              onRemove={(index) => handleRemovePersonality("userDislikes", index)}
            />
            {personality.currentStance ? (
              <View style={styles.checklist}>
                <Text style={styles.helpText}>Current stance</Text>
                <Text style={styles.bodyText}>{personality.currentStance}</Text>
              </View>
            ) : null}
            <ListSection
              title="Growth notes"
              items={personality.growthNotes}
              listKey="growth"
              onRemove={(index) => handleRemovePersonality("growthNotes", index)}
            />

            {hasPersonalityContent ? (
              <Pressable
                style={styles.smallButton}
                onPress={() => onThreadStateChange(clearPersonalityInThreadState(threadState))}
              >
                <Text style={styles.smallButtonText}>Clear personality</Text>
              </Pressable>
            ) : (
              <Text style={styles.helpText}>
                Personality starts neutral. Shape it through chat steering or message actions.
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}
