import { Text, View } from "react-native";

import { styles } from "./styles";

export interface PageHeaderChip {
  label: string;
  accent?: boolean;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  chips?: PageHeaderChip[];
}

export function PageHeader({ title, subtitle, chips }: PageHeaderProps) {
  return (
    <View style={styles.pageHeader}>
      <Text style={styles.pageHeaderTitle}>{title}</Text>
      {subtitle ? <Text style={styles.pageHeaderSubtitle}>{subtitle}</Text> : null}
      {chips && chips.length > 0 ? (
        <View style={styles.pageHeaderChips}>
          {chips.map((chip) => (
            <View key={chip.label} style={chip.accent ? styles.chatMetaPillAccent : styles.chatMetaPill}>
              <Text style={chip.accent ? styles.chatMetaPillTextAccent : styles.chatMetaPillText}>
                {chip.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
