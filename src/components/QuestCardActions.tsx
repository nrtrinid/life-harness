import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import {
  getQuestSecondaryActions,
  getQuestStartAction,
  isQuestDoneAvailable
} from "../core/questCardActions";
import type { CardState } from "../core/types";
import { useLifeHarness } from "../state/LifeHarnessState";
import { ActiveLimitTriagePanel } from "./ActiveLimitTriagePanel";
import { Notice } from "./Notice";
import { styles } from "./styles";

interface QuestCardActionsProps {
  cardId: string;
  currentState: CardState;
}

export function QuestCardActions({ cardId, currentState }: QuestCardActionsProps) {
  const router = useRouter();
  const { cards, setCardState } = useLifeHarness();
  const [moreOpen, setMoreOpen] = useState(false);
  const [warning, setWarning] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [showTriage, setShowTriage] = useState(false);

  const card = { state: currentState };
  const startAction = getQuestStartAction(card);
  const secondaryActions = getQuestSecondaryActions(card);
  const doneAvailable = isQuestDoneAvailable(card);
  const activeCards = cards.filter((item) => item.state === "active");

  useEffect(() => {
    if (!success) {
      return;
    }
    const timer = setTimeout(() => setSuccess(undefined), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  function handleStateChange(state: CardState) {
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
    setMoreOpen(false);
    if (result.message) {
      setSuccess(result.message);
    }
  }

  function handleStartPress() {
    if (startAction.kind === "activate") {
      handleStateChange("active");
      return;
    }
    if (startAction.kind === "openDetail") {
      router.push(`/card/${cardId}`);
    }
  }

  function handleSecondaryPress(action: (typeof secondaryActions)[number]) {
    if (action.kind === "viewDetail") {
      setMoreOpen(false);
      router.push(`/card/${cardId}`);
      return;
    }
    handleStateChange(action.state);
  }

  return (
    <View style={styles.questCardActionsWrap}>
      <View style={styles.questCardActionsRow}>
        {startAction.kind !== "hidden" ? (
          <Pressable style={styles.primaryAction} onPress={handleStartPress}>
            <Text style={styles.primaryActionText}>{startAction.label}</Text>
          </Pressable>
        ) : null}
        {doneAvailable ? (
          <Pressable style={styles.secondaryAction} onPress={() => handleStateChange("done")}>
            <Text style={styles.secondaryActionText}>Done</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: moreOpen }}
          style={styles.smallButton}
          onPress={() => setMoreOpen((value) => !value)}
        >
          <Text style={styles.smallButtonText}>{moreOpen ? "More ▾" : "More ▸"}</Text>
        </Pressable>
      </View>
      {moreOpen ? (
        <View style={styles.questCardMorePanel}>
          {secondaryActions.map((action) => (
            <Pressable
              key={action.kind === "setState" ? action.state : "viewDetail"}
              style={styles.smallButton}
              onPress={() => handleSecondaryPress(action)}
            >
              <Text style={styles.smallButtonText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
