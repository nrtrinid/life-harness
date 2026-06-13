import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CareerHubNextAction } from "../../core/careerHub";
import type { JobBoardTab } from "../../core/jobBoardTab";
import { lofiColors, styles } from "../styles";

interface CareerNextContractCardProps {
  action: CareerHubNextAction;
  onTabPress?: (tab: JobBoardTab) => void;
}

export function CareerNextContractCard({ action, onTabPress }: CareerNextContractCardProps) {
  const useTabSwitch = Boolean(action.tab && onTabPress);

  const ctaButton = useTabSwitch ? (
    <Pressable
      style={StyleSheet.flatten([styles.primaryAction, { alignSelf: "flex-start" }])}
      onPress={() => onTabPress!(action.tab!)}
    >
      <Text style={styles.primaryActionText}>{action.ctaLabel}</Text>
    </Pressable>
  ) : (
    <Link href={action.href as Href} asChild>
      <Pressable style={StyleSheet.flatten([styles.primaryAction, { alignSelf: "flex-start" }])}>
        <Text style={styles.primaryActionText}>{action.ctaLabel}</Text>
      </Pressable>
    </Link>
  );

  return (
    <View style={styles.lofiCardHero}>
      <Text style={styles.lofiTapeLabel}>Next outside-world move</Text>
      <Text style={styles.titleText}>{action.title}</Text>
      <Text style={styles.bodyText}>{action.reason}</Text>
      {ctaButton}
      <Text style={[styles.helpText, { color: lofiColors.textMuted }]}>
        One outside-world move first. Setup can wait.
      </Text>
    </View>
  );
}
