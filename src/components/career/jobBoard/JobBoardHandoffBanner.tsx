import { Pressable, StyleSheet, Text, View } from "react-native";

import type { JobBoardTab } from "../../../core/jobBoardTab";
import { colors, styles } from "../../styles";

export interface JobBoardHandoff {
  tab: JobBoardTab;
  count?: number;
  message?: string;
}

interface JobBoardHandoffBannerProps {
  handoff: JobBoardHandoff;
  onContinue: () => void;
  onDismiss?: () => void;
}

function handoffCopy(handoff: JobBoardHandoff): { title: string; cta: string } {
  if (handoff.tab === "review") {
    const count = handoff.count ?? 0;
    return {
      title:
        handoff.message ??
        (count > 0
          ? `${count} new match${count === 1 ? "" : "es"} ready for review`
          : "Matches are ready to review"),
      cta: "Review now"
    };
  }
  if (handoff.tab === "apply") {
    return {
      title: handoff.message ?? "Application started — pick up where you left off",
      cta: "Open Apply tab"
    };
  }
  return {
    title: handoff.message ?? "Continue to Find",
    cta: "Go to Find"
  };
}

export function JobBoardHandoffBanner({
  handoff,
  onContinue,
  onDismiss
}: JobBoardHandoffBannerProps) {
  const copy = handoffCopy(handoff);

  return (
    <View
      style={[
        styles.lofiCardHero,
        { borderLeftWidth: 4, borderLeftColor: colors.accentSuccess, gap: 10 }
      ]}
    >
      <Text style={styles.lofiTapeLabel}>Next step</Text>
      <Text style={styles.titleText}>{copy.title}</Text>
      <View style={styles.cardActionsRow}>
        <Pressable
          style={StyleSheet.flatten([styles.primaryAction, { flexGrow: 1 }])}
          onPress={onContinue}
        >
          <Text style={styles.primaryActionText}>{copy.cta}</Text>
        </Pressable>
        {onDismiss ? (
          <Pressable style={styles.secondaryAction} onPress={onDismiss}>
            <Text style={styles.secondaryActionText}>Dismiss</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
