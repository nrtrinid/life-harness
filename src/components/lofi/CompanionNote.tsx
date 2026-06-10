import { Text, View } from "react-native";

import { styles } from "../styles";

export function CompanionNote({ text }: { text: string }) {
  return (
    <View style={styles.lofiCardQuiet}>
      <Text style={styles.lofiTapeLabel}>Companion note</Text>
      <Text style={styles.lofiCompanionNote}>{text}</Text>
    </View>
  );
}
