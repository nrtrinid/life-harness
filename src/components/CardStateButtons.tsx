import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { CardState } from "../core/types";
import { useBoardActions } from "../state/lifeHarnessHooks";
import { Notice } from "./Notice";
import { styles } from "./styles";

interface CardStateButtonsProps {
  cardId: string;
  currentState: CardState;
  compact?: boolean;
}

const STATE_BUTTONS: { state: CardState; label: string }[] = [
  { state: "active", label: "Activate" },
  { state: "parked", label: "Park" },
  { state: "waiting", label: "Waiting" },
  { state: "done", label: "Done" },
  { state: "killed", label: "Kill" }
];

export function CardStateButtons({ cardId, currentState, compact = false }: CardStateButtonsProps) {
  const { setCardState } = useBoardActions();
  const [warning, setWarning] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();

  useEffect(() => {
    if (!success) {
      return;
    }
    const timer = setTimeout(() => setSuccess(undefined), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  function handlePress(state: CardState) {
    const result = setCardState(cardId, state);
    if (!result.ok) {
      setSuccess(undefined);
      setWarning(result.message);
      return;
    }
    setWarning(undefined);
    if (result.message) {
      setSuccess(result.message);
    }
  }

  return (
    <View style={compact ? styles.cardActionsColumn : styles.cardActions}>
      <View style={compact ? styles.cardActionsRow : styles.actionRow}>
        {STATE_BUTTONS.map(({ state, label }) => (
          <Pressable
            key={state}
            style={currentState === state ? styles.primaryAction : styles.smallButton}
            onPress={() => handlePress(state)}
          >
            <Text style={currentState === state ? styles.primaryActionText : styles.smallButtonText}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {warning ? <Notice kind="warning" message={warning} /> : null}
      {success ? <Notice kind="success" message={success} /> : null}
    </View>
  );
}
