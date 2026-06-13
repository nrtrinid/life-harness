import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { CARD_STATE_LABELS } from "../core/labels";
import type { CardState } from "../core/types";
import { useLifeHarness } from "../state/LifeHarnessState";
import { ActiveLimitTriagePanel } from "./ActiveLimitTriagePanel";
import { Notice } from "./Notice";
import { styles } from "./styles";

interface CardStateButtonsProps {
  cardId: string;
  currentState: CardState;
  compact?: boolean;
}

const STATE_BUTTONS: CardState[] = ["active", "parked", "waiting", "done", "killed"];

export function CardStateButtons({ cardId, currentState, compact = false }: CardStateButtonsProps) {
  const { cards, setCardState } = useLifeHarness();
  const [warning, setWarning] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [showTriage, setShowTriage] = useState(false);
  const activeCards = cards.filter((item) => item.state === "active");

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
      if (state === "active") {
        setShowTriage(true);
      }
      return;
    }
    setWarning(undefined);
    setShowTriage(false);
    if (result.message) {
      setSuccess(result.message);
    }
  }

  return (
    <View style={compact ? styles.cardActionsColumn : styles.cardActions}>
      <View style={compact ? styles.cardActionsRow : styles.actionRow}>
        {STATE_BUTTONS.map((state) => (
          <Pressable
            key={state}
            style={currentState === state ? styles.primaryAction : styles.smallButton}
            onPress={() => handlePress(state)}
          >
            <Text style={currentState === state ? styles.primaryActionText : styles.smallButtonText}>
              {state === "active" ? "Activate" : CARD_STATE_LABELS[state]}
            </Text>
          </Pressable>
        ))}
      </View>
      {showTriage ? (
        <ActiveLimitTriagePanel
          activeCards={activeCards}
          onStateChange={(targetId, state) => setCardState(targetId, state)}
          onDismiss={() => setShowTriage(false)}
        />
      ) : null}
      {warning ? <Notice kind="warning" message={warning} /> : null}
      {success ? <Notice kind="success" message={success} /> : null}
    </View>
  );
}
