import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { colors, styles } from "../styles";

interface StarterSourceBannerProps {
  sourceIds: string[];
  onDismiss: () => void;
}

export function StarterSourceBanner({ sourceIds, onDismiss }: StarterSourceBannerProps) {
  if (sourceIds.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.lofiCardQuiet,
        { borderLeftWidth: 3, borderLeftColor: colors.accentSuccess, gap: 8 }
      ]}
    >
      <Text style={styles.lofiTapeLabel}>New runnable sources</Text>
      <Text style={styles.bodyText}>
        {sourceIds.length} new starter source{sourceIds.length === 1 ? "" : "s"} added — review
        before Run all.
      </Text>
      <View style={styles.cardActionsRow}>
        <Link href="/job-sources" asChild>
          <Pressable style={styles.primaryAction}>
            <Text style={styles.primaryActionText}>Open Sources</Text>
          </Pressable>
        </Link>
        <Pressable style={styles.secondaryAction} onPress={onDismiss}>
          <Text style={styles.secondaryActionText}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}
