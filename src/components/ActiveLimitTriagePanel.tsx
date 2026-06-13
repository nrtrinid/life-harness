import { Pressable, Text, View } from "react-native";

import { CARD_STATE_LABELS } from "../core/labels";
import type { CardState, LifeCard } from "../core/types";
import { styles } from "./styles";

interface ActiveLimitTriagePanelProps {
  activeCards: LifeCard[];
  onStateChange: (cardId: string, state: CardState) => void;
  onDismiss: () => void;
}

export function ActiveLimitTriagePanel({
  activeCards,
  onStateChange,
  onDismiss
}: ActiveLimitTriagePanelProps) {
  if (activeCards.length === 0) {
    return null;
  }

  return (
    <View style={styles.activeLimitTriagePanel}>
      <Text style={styles.label}>Active is full — free a slot</Text>
      <Text style={styles.helpText}>
        Waiting for applied jobs. Park for later focus. Archive to close a thread.
      </Text>
      {activeCards.map((card) => (
        <View key={card.id} style={styles.activeLimitTriageRow}>
          <Text style={styles.bodyText}>{card.title}</Text>
          <View style={styles.activeLimitTriageActions}>
            <Pressable style={styles.smallButton} onPress={() => onStateChange(card.id, "waiting")}>
              <Text style={styles.smallButtonText}>{CARD_STATE_LABELS.waiting}</Text>
            </Pressable>
            <Pressable style={styles.smallButton} onPress={() => onStateChange(card.id, "parked")}>
              <Text style={styles.smallButtonText}>{CARD_STATE_LABELS.parked}</Text>
            </Pressable>
            <Pressable style={styles.smallButton} onPress={() => onStateChange(card.id, "killed")}>
              <Text style={styles.smallButtonText}>{CARD_STATE_LABELS.killed}</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable style={styles.secondaryAction} onPress={onDismiss}>
        <Text style={styles.secondaryActionText}>Dismiss</Text>
      </Pressable>
    </View>
  );
}
