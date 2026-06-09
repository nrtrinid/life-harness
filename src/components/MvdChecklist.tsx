import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { NoticeState } from "./Notice";
import { useLifeHarness } from "../state/LifeHarnessState";
import { styles } from "./styles";

const MVD_ITEMS = [
  "Eat something real",
  "Move 10 minutes",
  "Send one message OR open one project for 10 minutes",
  "Write tomorrow's first move"
] as const;

interface MvdChecklistProps {
  onNotice: (notice: NoticeState) => void;
}

export function MvdChecklist({ onNotice }: MvdChecklistProps) {
  const { dailyState, completeMinimumViableDay } = useLifeHarness();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const allChecked = MVD_ITEMS.every((_, index) => checked[index]);
  const completed = dailyState.minimumViableDayCompleted;

  function toggleItem(index: number) {
    setChecked((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  function handleComplete() {
    if (completed) {
      return;
    }
    if (!allChecked) {
      onNotice({ kind: "warning", message: "Check all four items first." });
      return;
    }
    const result = completeMinimumViableDay();
    if (result.ok) {
      onNotice({ kind: "success", message: result.message ?? "+30 XP · Day preserved" });
      setOpen(false);
      setChecked({});
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
          {completed ? "MVD Complete" : "Minimum Viable Day"}
        </Text>
      </Pressable>
      {open && !completed ? (
        <View style={styles.checklist}>
          {MVD_ITEMS.map((item, index) => (
            <Pressable key={item} style={styles.checklistItem} onPress={() => toggleItem(index)}>
              <Text style={styles.listItem}>
                {checked[index] ? "▸" : "○"} {item}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={allChecked ? styles.primaryAction : styles.secondaryAction}
            onPress={handleComplete}
          >
            <Text style={allChecked ? styles.primaryActionText : styles.secondaryActionText}>
              Preserve Day
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
