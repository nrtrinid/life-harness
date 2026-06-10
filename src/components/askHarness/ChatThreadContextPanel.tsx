import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  clearSharedThreadMemory,
  pinThreadFact,
  removeSharedThreadStateItem,
  type SharedChatThreadState,
  type SharedThreadStateListKey
} from "../../core/chatThreadState";
import { styles } from "../styles";

interface ChatThreadContextPanelProps {
  threadState: SharedChatThreadState;
  onThreadStateChange: (state: SharedChatThreadState) => void;
}

function ListSection({
  title,
  items,
  listKey,
  onRemove
}: {
  title: string;
  items: string[];
  listKey: string;
  onRemove: (index: number) => void;
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
          <Pressable style={styles.smallButton} onPress={() => onRemove(index)}>
            <Text style={styles.smallButtonText}>Forget this</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function ScalarField({ label, value }: { label: string; value: string }) {
  if (!value.trim()) {
    return null;
  }
  return (
    <View style={styles.checklist}>
      <Text style={styles.helpText}>{label}</Text>
      <Text style={styles.bodyText}>{value}</Text>
    </View>
  );
}

export function ChatThreadContextPanel({
  threadState,
  onThreadStateChange
}: ChatThreadContextPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const hasContent =
    Boolean(threadState.recentDigest) ||
    Boolean(threadState.activeGoal) ||
    Boolean(threadState.currentTopic) ||
    threadState.taskMode !== "casual" ||
    threadState.openLoops.length > 0 ||
    threadState.decisions.length > 0 ||
    threadState.pinnedFacts.length > 0 ||
    threadState.userSteering.length > 0 ||
    threadState.doNotRepeat.length > 0 ||
    threadState.references.lastOptions.length > 0 ||
    Boolean(threadState.references.lastCodeBlock) ||
    Boolean(threadState.references.likelyReference);

  function handleRemove(key: SharedThreadStateListKey, index: number) {
    onThreadStateChange(removeSharedThreadStateItem(threadState, key, index));
  }

  function handleClearContext() {
    onThreadStateChange(clearSharedThreadMemory(threadState));
  }

  function handlePinCurrentTopic() {
    if (!threadState.currentTopic.trim()) {
      return;
    }
    onThreadStateChange(pinThreadFact(threadState, threadState.currentTopic));
  }

  return (
    <View style={styles.checklist}>
      <Pressable style={styles.smallButton} onPress={() => setCollapsed((open) => !open)}>
        <Text style={styles.smallButtonText}>
          {collapsed ? "Show conversation context" : "Hide conversation context"}
        </Text>
      </Pressable>

      {!collapsed ? (
        <View style={styles.checklist}>
          <Text style={styles.helpText}>Conversation context</Text>
          <Text style={styles.bodyText}>
            Temporary to this chat. Board context is still source of truth.
          </Text>

          {!hasContent ? (
            <Text style={styles.bodyText}>No conversation context yet.</Text>
          ) : (
            <>
              <ScalarField label="Active goal" value={threadState.activeGoal} />
              <ScalarField label="Current topic" value={threadState.currentTopic} />
              <ScalarField label="Task mode" value={threadState.taskMode} />
              <ScalarField label="Recent digest" value={threadState.recentDigest} />
              <ScalarField
                label="Likely reference"
                value={threadState.references.likelyReference ?? ""}
              />
              {threadState.references.lastCodeBlock ? (
                <ScalarField
                  label="Last code block"
                  value={`${threadState.references.lastCodeBlock.language || "code"}: ${compactCodeSummary(threadState.references.lastCodeBlock.code)}`}
                />
              ) : null}

              <ListSection
                title="Open loops"
                items={threadState.openLoops}
                listKey="openLoops"
                onRemove={(index) => handleRemove("openLoops", index)}
              />
              <ListSection
                title="Decisions"
                items={threadState.decisions}
                listKey="decisions"
                onRemove={(index) => handleRemove("decisions", index)}
              />
              <ListSection
                title="Pinned facts"
                items={threadState.pinnedFacts}
                listKey="pinnedFacts"
                onRemove={(index) => handleRemove("pinnedFacts", index)}
              />
              <ListSection
                title="User steering"
                items={threadState.userSteering}
                listKey="userSteering"
                onRemove={(index) => handleRemove("userSteering", index)}
              />
              <ListSection
                title="Do not repeat"
                items={threadState.doNotRepeat}
                listKey="doNotRepeat"
                onRemove={(index) => handleRemove("doNotRepeat", index)}
              />
              <ListSection
                title="Last options"
                items={threadState.references.lastOptions}
                listKey="lastOptions"
                onRemove={(index) => {
                  onThreadStateChange({
                    ...threadState,
                    references: {
                      ...threadState.references,
                      lastOptions: threadState.references.lastOptions.filter(
                        (_, itemIndex) => itemIndex !== index
                      )
                    },
                    updatedAt: new Date().toISOString()
                  });
                }}
              />
            </>
          )}

          <View style={styles.splitRow}>
            {threadState.currentTopic ? (
              <Pressable style={styles.chatBubbleToggle} onPress={handlePinCurrentTopic}>
                <Text style={styles.chatBubbleToggleText}>Pin current topic</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.smallButton} onPress={handleClearContext}>
              <Text style={styles.smallButtonText}>Clear conversation context</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function compactCodeSummary(code: string): string {
  const oneLine = code.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 80) {
    return oneLine;
  }
  return `${oneLine.slice(0, 77)}...`;
}
