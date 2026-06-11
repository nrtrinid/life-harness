import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "./styles";

interface SafetyBannerProps {
  message: string;
  detail?: string;
  detailCollapsed?: boolean;
}

export function SafetyBanner({ message, detail, detailCollapsed = false }: SafetyBannerProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const showDetail = detail && (!detailCollapsed || detailOpen);

  return (
    <View style={styles.chatModeNoteRawSignal}>
      <Text style={styles.bodyText}>{message}</Text>
      {detail && detailCollapsed ? (
        <Pressable onPress={() => setDetailOpen((open) => !open)} style={{ marginTop: 6 }}>
          <Text style={styles.helpText}>{detailOpen ? "Hide detail" : "More about safety"}</Text>
        </Pressable>
      ) : null}
      {showDetail && !detailCollapsed ? (
        <Text style={[styles.helpText, { marginTop: 6 }]}>{detail}</Text>
      ) : null}
      {showDetail && detailCollapsed && detailOpen ? (
        <Text style={[styles.helpText, { marginTop: 6 }]}>{detail}</Text>
      ) : null}
    </View>
  );
}
