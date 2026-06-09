import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { NoticeState } from "./Notice";
import { useLifeHarness } from "../state/LifeHarnessState";
import { styles } from "./styles";

const SALVAGE_OPTIONS = [
  "send one follow-up",
  "paste one job description",
  "identify one resume bullet",
  "open one project for 10 minutes",
  "write tomorrow's first move"
] as const;

interface SalvagePickerProps {
  onNotice: (notice: NoticeState) => void;
}

export function SalvagePicker({ onNotice }: SalvagePickerProps) {
  const { dailyState, completeSalvage } = useLifeHarness();
  const [open, setOpen] = useState(false);
  const completed = dailyState.salvageCompleted;

  function handlePick(option: string) {
    const result = completeSalvage(option);
    if (result.ok) {
      onNotice({ kind: "success", message: result.message ?? "+30 XP · Salvage logged" });
      setOpen(false);
    } else {
      onNotice({ kind: "warning", message: result.message ?? "Already completed." });
    }
  }

  return (
    <View style={styles.actionPanel}>
      <Pressable
        style={styles.secondaryAction}
        onPress={() => setOpen((value) => !value)}
        disabled={completed}
      >
        <Text style={styles.secondaryActionText}>
          {completed ? "Salvage Complete" : "Salvage Mode"}
        </Text>
      </Pressable>
      {open && !completed ? (
        <View style={styles.checklist}>
          <Text style={styles.bodyText}>Day not dead. Pick one salvage action.</Text>
          {SALVAGE_OPTIONS.map((option) => (
            <Pressable key={option} style={styles.checklistItem} onPress={() => handlePick(option)}>
              <Text style={styles.listItem}>▸ {option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
