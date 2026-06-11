import { Text, View } from "react-native";

import { styles } from "../styles";

interface CareerStatusChipProps {
  label: string;
  accent?: boolean;
}

export function CareerStatusChip({ label, accent }: CareerStatusChipProps) {
  return (
    <View style={accent ? styles.chatMetaPillAccent : styles.chatMetaPill}>
      <Text style={accent ? styles.chatMetaPillTextAccent : styles.chatMetaPillText}>{label}</Text>
    </View>
  );
}
