import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import { AREA_LABELS, LOG_TYPE_LABELS } from "../src/core/labels";
import { useLifeHarness } from "../src/state/LifeHarnessState";

export default function LogScreen() {
  const { cards, logs } = useLifeHarness();
  const sortedLogs = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <Screen>
      <Text style={styles.screenIntro}>Raw mission log — every action recorded.</Text>
      <Text style={styles.helpText}>Entries are append-only in v0.1.</Text>
      <Section title="Raw History">
        {sortedLogs.length === 0 ? (
          <Text style={styles.emptyText}>No entries logged yet.</Text>
        ) : (
          sortedLogs.map((entry) => {
            const linkedCard = cards.find((card) => card.id === entry.cardId);

            return (
              <View key={entry.id} style={styles.logItem}>
                <Text style={styles.titleText}>{entry.rawText}</Text>
                <Text style={styles.bodyText}>
                  {LOG_TYPE_LABELS[entry.type]} · {AREA_LABELS[entry.area]} · {entry.xp} XP
                </Text>
                {linkedCard ? (
                  <Link href={`/card/${linkedCard.id}`} asChild>
                    <Pressable accessibilityRole="link">
                      <Text style={styles.helpText}>Linked: {linkedCard.title}</Text>
                    </Pressable>
                  </Link>
                ) : (
                  <Text style={styles.helpText}>Linked: None</Text>
                )}
              </View>
            );
          })
        )}
      </Section>
    </Screen>
  );
}
