import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { MvdChecklist } from "../MvdChecklist";
import type { NoticeState } from "../Notice";
import { SalvagePicker } from "../SalvagePicker";
import { styles } from "../styles";

interface RescueRowProps {
  onNotice: (notice: NoticeState) => void;
}

export function RescueRow({ onNotice }: RescueRowProps) {
  const [open, setOpen] = useState<"mvd" | "salvage" | null>(null);

  return (
    <View style={styles.lofiCardQuiet}>
      <View style={styles.lofiRescueRow}>
        <Pressable style={styles.secondaryAction} onPress={() => setOpen(open === "mvd" ? null : "mvd")}>
          <Text style={styles.secondaryActionText}>Minimum viable day</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryAction}
          onPress={() => setOpen(open === "salvage" ? null : "salvage")}
        >
          <Text style={styles.secondaryActionText}>Salvage mode</Text>
        </Pressable>
      </View>
      {open === "mvd" ? <MvdChecklist onNotice={onNotice} /> : null}
      {open === "salvage" ? <SalvagePicker onNotice={onNotice} /> : null}
    </View>
  );
}
