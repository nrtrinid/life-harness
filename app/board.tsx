import { ScrollView, Text, View } from "react-native";

import { ActiveLimitBanner } from "../src/components/ActiveLimitBanner";
import { CardTile } from "../src/components/CardTile";
import { Nav } from "../src/components/Nav";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { styles } from "../src/components/styles";
import { ACTIVE_CARD_LIMIT, CARD_STATE_LABELS, CARD_STATES, getActiveLimitStatus, groupCardsByState } from "../src/core/guards";
import { useLifeHarness } from "../src/state/LifeHarnessState";

export default function BoardScreen() {
  const { cards, logs } = useLifeHarness();
  const groupedCards = groupCardsByState(cards);
  const activeLimit = getActiveLimitStatus(cards);

  return (
    <Screen>
      <Nav />
      <PageHeader
        title="Board"
        subtitle={`Inbox is safe capture. Active operations limited to ${ACTIVE_CARD_LIMIT}. Parked is saved, not failed.`}
      />
      <Text style={styles.helpText}>Swipe sideways for Inbox, Parked, Waiting, and more.</Text>
      <ActiveLimitBanner />
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.boardRow}>
        {CARD_STATES.map((state) => (
          <View key={state} style={styles.boardColumn}>
            <Text style={styles.columnTitle}>
              {CARD_STATE_LABELS[state]} ({groupedCards[state].length})
            </Text>
            {groupedCards[state].length === 0 ? (
              <Text style={styles.emptyText}>Nothing here.</Text>
            ) : (
              groupedCards[state].map((card) => (
                <CardTile key={card.id} card={card} logs={logs} showStateButtons />
              ))
            )}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
