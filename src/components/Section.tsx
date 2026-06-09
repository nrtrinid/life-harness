import { type PropsWithChildren } from "react";
import { Text, View } from "react-native";

import { styles } from "./styles";

interface SectionProps extends PropsWithChildren {
  title: string;
  accent?: "xp" | "warmth" | "proof";
}

const ACCENT_STYLES = {
  xp: styles.sectionXp,
  warmth: styles.sectionWarmth,
  proof: styles.sectionProof
} as const;

export function Section({ title, children, accent }: SectionProps) {
  return (
    <View style={[styles.section, accent ? ACCENT_STYLES[accent] : null]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}
