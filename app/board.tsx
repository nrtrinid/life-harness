import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ActiveLimitBanner } from "../src/components/ActiveLimitBanner";
import { BoardSlotModelStrip } from "../src/components/BoardSlotModelStrip";
import { CardTile } from "../src/components/CardTile";
import { DemoTriageBanner } from "../src/components/DemoTriageBanner";
import { NewCardForm } from "../src/components/NewCardForm";
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
  killed: "Archived"
};

const BOARD_EMPTY_COPY: Record<CardState, string> = {
  inbox: "New ideas land here first, safely outside Active.",
  active: "Keep this lane to three. Start one tiny action, then log proof.",
  parked: "Parked means safe, not failed.",
  waiting: "Waiting cards stay visible without crowding Active.",
  done: "Done work stays here for playback.",
  killed: "Archived ideas stay out of the way."
};

export default function BoardScreen() {
  const { cards, logs, dailyState } = useLifeHarness();
  const groupedCards = groupCardsByState(cards);
  const [showNewCardForm, setShowNewCardForm] = useState(false);

  return (
    <Screen>
      <PageHeader
        title="Board"
        subtitle="Live lanes — decide, do, park, or wait."
      />
      <DemoTriageBanner cards={cards} dailyState={dailyState} />
      <BoardSlotModelStrip />
      <ActiveLimitBanner />
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.boardRow}>
        {CARD_STATES.map((state) => (
          <View key={state} style={styles.boardColumn}>
            <Text style={styles.columnTitle}>
              {BOARD_COLUMN_LABELS[state]} ({groupedCards[state].length})
            </Text>
            {state === "inbox" && showNewCardForm ? (
              <NewCardForm onCreated={() => setShowNewCardForm(false)} onCancel={() => setShowNewCardForm(false)} />
            ) : null}
            {groupedCards[state].length === 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.emptyText}>{BOARD_EMPTY_COPY[state]}</Text>
                {state === "inbox" ? (
                  <>
                    <Pressable style={styles.primaryAction} onPress={() => setShowNewCardForm(true)}>
                      <Text style={styles.primaryActionText}>New card</Text>
                    </Pressable>
                    <Link href="/career?tab=find&add=1" asChild>
                      <Pressable style={styles.secondaryAction}>
                        <Text style={styles.secondaryActionText}>Add job</Text>
                      </Pressable>
                    </Link>
                  </>
                ) : null}
              </View>
            ) : (
              <>
                {state === "inbox" ? (
                  <Pressable style={styles.smallButton} onPress={() => setShowNewCardForm((open) => !open)}>
                    <Text style={styles.smallButtonText}>{showNewCardForm ? "Hide form" : "New card"}</Text>
                  </Pressable>
                ) : null}
                {groupedCards[state].map((card) => (
                  <CardTile key={card.id} card={card} logs={logs} actionVariant="quest" />
                ))}
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
