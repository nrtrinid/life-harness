import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";

interface CompanionBudgetSectionProps {
  selectedPromptChars: number;
  gatewayMaxInputChars: number;
  promptOverBudget: boolean;
  contextMode: "full" | "compact";
  lastNoticeMessage?: string | null;
}

export function CompanionBudgetSection({
  selectedPromptChars,
  gatewayMaxInputChars,
  promptOverBudget,
  contextMode,
  lastNoticeMessage
}: CompanionBudgetSectionProps) {
  return (
    <View style={styles.chatBackroomSection}>
      <Text style={styles.chatInspectorSectionTitle}>Thread budget</Text>
      <Text style={styles.bodyText}>
        {promptOverBudget ? "Budget warning" : "Budget OK"} — ~
        {selectedPromptChars.toLocaleString()} / {gatewayMaxInputChars.toLocaleString()} chars (
        {contextMode} context).
      </Text>
      {lastNoticeMessage ? (
        <Text style={styles.bannerWarningText}>{lastNoticeMessage}</Text>
      ) : (
        <Text style={styles.helpText}>
          Compact older thread memory when needed. Full details in context snapshot below.
        </Text>
      )}
    </View>
  );
}
