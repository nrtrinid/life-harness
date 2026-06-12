import { Text, View } from "react-native";

import type { ReasoningDepth } from "../../core/chatHarnessClient";
import { reasoningDepthLabel } from "../../core/companionLabels";
import { styles } from "../styles";

interface ReasoningDepthPillProps {
  depth: ReasoningDepth;
  variant?: "rawSignal" | "companion";
}

export function ReasoningDepthPill({
  depth,
  variant = "rawSignal"
}: ReasoningDepthPillProps) {
  const pillStyle =
    variant === "companion"
      ? styles.chatReasoningDepthPillCompanion
      : styles.chatReasoningDepthPillRawSignal;
  const textStyle =
    variant === "companion"
      ? styles.chatReasoningDepthPillTextCompanion
      : styles.chatReasoningDepthPillTextRawSignal;

  return (
    <View style={pillStyle}>
      <Text style={textStyle}>{reasoningDepthLabel(depth)}</Text>
    </View>
  );
}
