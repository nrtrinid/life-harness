import { Pressable, Text, View } from "react-native";

import type { CardState } from "../core/types";
import { styles } from "./styles";

interface WaitingNudgeProps {
  cardId: string;
  label: string;
  onMove: (cardId: string, state: CardState) => void;
  onDismiss: () => void;
}

export function WaitingNudge({ cardId, label, onMove, onDismiss }: WaitingNudgeProps) {
  return (
    <View style={styles.waitingNudge}>
      <Text style={styles.helpText}>Applied or waiting on a reply? Move off Active.</Text>
      <View style={styles.waitingNudgeActions}>
        <Pressable
          style={styles.primaryAction}
          onPress={() => {
            onMove(cardId, "waiting");
            onDismiss();
          }}
        >
          <Text style={styles.primaryActionText}>{label}</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={onDismiss}>
          <Text style={styles.secondaryActionText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}
