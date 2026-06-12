import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { ReasoningDepth } from "../../core/chatHarnessClient";
import {
  reasoningPanelTitle,
  shouldShowReasoningPanel,
  thinkingStatusForDepth
} from "../../core/companionLabels";
import {
  PLACEHOLDER_REASONING_STEPS,
  placeholderReasoningStepIndex
} from "../../core/reasoningTracePlaceholder";
import { styles } from "../styles";

interface ChatReasoningPanelProps {
  visible: boolean;
  reasoningDepth: ReasoningDepth;
  streamingStarted?: boolean;
  title?: string;
  variant?: "rawSignal" | "companion";
}

export function ChatReasoningPanel({
  visible,
  reasoningDepth,
  streamingStarted = false,
  title,
  variant = "rawSignal"
}: ChatReasoningPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!visible) {
      setElapsedMs(0);
      setExpanded(true);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 500);

    return () => clearInterval(timer);
  }, [visible]);

  useEffect(() => {
    if (streamingStarted) {
      setExpanded(false);
    }
  }, [streamingStarted]);

  if (!visible || !shouldShowReasoningPanel(reasoningDepth)) {
    return null;
  }

  const panelTitle = title ?? reasoningPanelTitle(reasoningDepth);
  const steps = PLACEHOLDER_REASONING_STEPS[reasoningDepth];
  const activeStepIndex = placeholderReasoningStepIndex(
    reasoningDepth,
    elapsedMs,
    streamingStarted
  );

  return (
    <View
      style={[
        styles.chatReasoningPanel,
        variant === "rawSignal"
          ? styles.chatReasoningPanelRawSignal
          : styles.chatBubbleAssistantCompanion
      ]}
    >
      <Pressable
        accessibilityRole="button"
        style={styles.chatReasoningHeader}
        onPress={() => setExpanded((open) => !open)}
      >
        <View style={styles.chatReasoningHeaderText}>
          <Text style={styles.chatReasoningTitle}>{panelTitle}</Text>
          <Text style={styles.chatReasoningStatus}>
            {thinkingStatusForDepth(reasoningDepth, elapsedMs)}
          </Text>
        </View>
        <Text style={styles.chatReasoningChevron}>{expanded ? "▾" : "▸"}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.chatReasoningSteps}>
          {steps.map((step, index) => (
            <Text
              key={step}
              style={
                index <= activeStepIndex
                  ? styles.chatReasoningStepActive
                  : styles.chatReasoningStep
              }
            >
              {index <= activeStepIndex ? "· " : "○ "}
              {step}
            </Text>
          ))}
          {reasoningDepth === "deep" ? (
            <Text style={styles.chatReasoningPlaceholderNote}>
              Placeholder trace — real reasoning steps will stream here later.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
