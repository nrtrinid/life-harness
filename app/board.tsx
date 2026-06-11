import { ScrollView, Text, View } from "react-native";

import { ActiveLimitBanner } from "../src/components/ActiveLimitBanner";
import { CardTile } from "../src/components/CardTile";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { styles } from "../src/components/styles";
import { CARD_STATES, groupCardsByState } from "../src/core/guards";
import type { CardState } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const BOARD_COLUMN_LABELS: Record<CardState, string> = {
  inbox: "Inbox",
  active: "Active",
  parked: "Parked / Later",
  waiting: "Waiting",
  done: "Done / Archive",
  killed: "Killed"
};

export default function BoardScreen() {
  const { cards, logs } = useLifeHarness();
  const groupedCards = groupCardsByState(cards);

  return (
    <Screen>
      <PageHeader
        title="Board"
        subtitle="Active quests, parked threads, and next tiny actions."
      />
      <ActiveLimitBanner />
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.boardRow}>
        {CARD_STATES.map((state) => (
          <View key={state} style={styles.boardColumn}>
            <Text style={styles.columnTitle}>
              {BOARD_COLUMN_LABELS[state]} ({groupedCards[state].length})
            </Text>
            {groupedCards[state].length === 0 ? (
              <Text style={styles.emptyText}>Nothing here.</Text>
            ) : (
              groupedCards[state].map((card) => (
                <CardTile key={card.id} card={card} logs={logs} actionVariant="quest" />
              ))
            )}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
