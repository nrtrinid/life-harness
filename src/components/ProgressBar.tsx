import { Text, View } from "react-native";

import { styles } from "./styles";

interface ProgressBarProps {
  value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${safeValue}%` }]} />
      </View>
      <Text style={styles.progressText}>{safeValue}%</Text>
    </View>
  );
}
