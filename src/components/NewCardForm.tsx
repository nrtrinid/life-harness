import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { AREA_LABELS } from "../core/labels";
import type { LifeArea } from "../core/types";
import { useLifeHarness } from "../state/LifeHarnessState";
import { colors, styles } from "./styles";

const AREAS = Object.keys(AREA_LABELS) as LifeArea[];

interface NewCardFormProps {
  onCreated?: (cardId: string) => void;
  onCancel?: () => void;
}

export function NewCardForm({ onCreated, onCancel }: NewCardFormProps) {
  const { submitCreateCard } = useLifeHarness();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<LifeArea>("build");
  const [nextTinyAction, setNextTinyAction] = useState("");
  const [error, setError] = useState<string | undefined>();

  function handleSubmit() {
    const result = submitCreateCard({
      title,
      area,
      nextTinyAction: nextTinyAction.trim() || undefined
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTitle("");
    setNextTinyAction("");
    setError(undefined);
    if (result.cardId) {
      onCreated?.(result.cardId);
    }
  }

  return (
    <View style={styles.newCardForm}>
      <Text style={styles.label}>New card (Inbox)</Text>
      <TextInput
        style={styles.captureInput}
        placeholder="Title"
        placeholderTextColor={colors.inputPlaceholder}
        value={title}
        onChangeText={setTitle}
      />
      <View style={styles.newCardAreaRow}>
        {AREAS.map((option) => (
          <Pressable
            key={option}
            style={area === option ? styles.primaryAction : styles.smallButton}
            onPress={() => setArea(option)}
          >
            <Text style={area === option ? styles.primaryActionText : styles.smallButtonText}>
              {AREA_LABELS[option]}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.captureInput}
        placeholder="Next tiny action (optional)"
        placeholderTextColor={colors.inputPlaceholder}
        value={nextTinyAction}
        onChangeText={setNextTinyAction}
      />
      {error ? <Text style={styles.warningText}>{error}</Text> : null}
      <View style={styles.newCardFormActions}>
        <Pressable style={styles.primaryAction} onPress={handleSubmit}>
          <Text style={styles.primaryActionText}>Add to Inbox</Text>
        </Pressable>
        {onCancel ? (
          <Pressable style={styles.secondaryAction} onPress={onCancel}>
            <Text style={styles.secondaryActionText}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
