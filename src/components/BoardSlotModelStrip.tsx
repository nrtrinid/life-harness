import { Text, View } from "react-native";

import { ACTIVE_CARD_LIMIT } from "../core/guards";
import { styles } from "./styles";

export function BoardSlotModelStrip() {
  return (
    <View style={styles.boardSlotStrip}>
      <Text style={styles.boardSlotStripTitle}>How slots work</Text>
      <Text style={styles.helpText}>
        Active ({ACTIVE_CARD_LIMIT} max) = executing this week. Waiting = applied / blocked (no
        slot). Parked = safe, not now. Inbox = captured, not committed yet.
      </Text>
    </View>
  );
}
