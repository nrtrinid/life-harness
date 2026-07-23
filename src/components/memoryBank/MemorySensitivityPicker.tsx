import { Pressable, Text, View } from "react-native";

import { MEMORY_SENSITIVITY_LEVELS } from "../../core/harnessMemoryBank";
import type { SensitivityLevel } from "../../core/types";
import { styles } from "../styles";

interface MemorySensitivityPickerProps {
  value: SensitivityLevel | null;
  onChange: (value: SensitivityLevel) => void;
  label?: string;
}

export function MemorySensitivityPicker({
  value,
  onChange,
  label = "Sensitivity (required)"
}: MemorySensitivityPickerProps) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.helpText}>{label}</Text>
      <View style={styles.splitRow}>
        {MEMORY_SENSITIVITY_LEVELS.map((option) => (
          <Pressable
            key={option}
            style={value === option ? styles.chatMetaPillAccent : styles.chatQuickChip}
            onPress={() => onChange(option)}
          >
            <Text
              style={
                value === option
                  ? styles.chatMetaPillTextAccent
                  : styles.chatQuickChipText
              }
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.helpText}>
        S0 safe | S1 personal | S2 local preferred | S3 never send to AI
      </Text>
    </View>
  );
}
