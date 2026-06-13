import { Pressable, Text, View } from "react-native";

import { shouldShowDemoTriageBanner } from "../core/boardUsability";
import type { DailyState, LifeCard } from "../core/types";
import { useLifeHarness } from "../state/LifeHarnessState";
import { styles } from "./styles";

interface DemoTriageBannerProps {
  cards: LifeCard[];
  dailyState: DailyState;
}

export function DemoTriageBanner({ cards, dailyState }: DemoTriageBannerProps) {
  const { dismissDemoTriage } = useLifeHarness();

  if (!shouldShowDemoTriageBanner(cards, dailyState)) {
    return null;
  }

  return (
    <View style={styles.demoTriageBanner}>
      <Text style={styles.demoTriageTitle}>Board setup tip</Text>
      <Text style={styles.helpText}>
        Active = this week (max 3). Waiting = applied jobs (free slot). Parked = later. Archive
        demo cards you do not want.
      </Text>
      <Pressable style={styles.smallButton} onPress={dismissDemoTriage}>
        <Text style={styles.smallButtonText}>Got it</Text>
      </Pressable>
    </View>
  );
}
