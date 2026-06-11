import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CareerHubNextAction } from "../../core/careerHub";
import { lofiColors, styles } from "../styles";

interface CareerNextContractCardProps {
  action: CareerHubNextAction;
}

export function CareerNextContractCard({ action }: CareerNextContractCardProps) {
  return (
    <View style={styles.lofiCardHero}>
      <Text style={styles.lofiTapeLabel}>Next outside-world move</Text>
      <Text style={styles.titleText}>{action.title}</Text>
      <Text style={styles.bodyText}>{action.reason}</Text>
      <Link href={action.href as Href} asChild>
        <Pressable style={StyleSheet.flatten([styles.primaryAction, { alignSelf: "flex-start" }])}>
          <Text style={styles.primaryActionText}>{action.ctaLabel}</Text>
        </Pressable>
      </Link>
      <Text style={[styles.helpText, { color: lofiColors.textMuted }]}>
        One outside-world move first. Setup can wait.
      </Text>
    </View>
  );
}
