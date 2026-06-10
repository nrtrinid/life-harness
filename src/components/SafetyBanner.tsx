import { Text, View } from "react-native";

import { styles } from "./styles";

interface SafetyBannerProps {
  message: string;
  detail?: string;
}

export function SafetyBanner({ message, detail }: SafetyBannerProps) {
  return (
    <View style={styles.bannerWarning}>
      <Text style={styles.bannerWarningText}>{message}</Text>
      {detail ? <Text style={[styles.helpText, { marginTop: 6 }]}>{detail}</Text> : null}
    </View>
  );
}
