import { Text, View } from "react-native";

import { ACTIVE_CARD_LIMIT, getActiveLimitStatus } from "../core/guards";
import { useLifeHarness } from "../state/LifeHarnessState";
import { styles } from "./styles";

export function ActiveLimitBanner() {
  const { cards } = useLifeHarness();
  const activeLimit = getActiveLimitStatus(cards);

  if (activeLimit.isOverLimit) {
    return (
      <View style={styles.bannerWarning}>
        <Text style={styles.bannerWarningText}>
          Active {activeLimit.count}/{ACTIVE_CARD_LIMIT} — park one before activating more.
        </Text>
      </View>
    );
  }

  if (activeLimit.isAtLimit) {
    return (
      <View style={styles.bannerInfo}>
        <Text style={styles.bannerInfoText}>
          Active {activeLimit.count}/{ACTIVE_CARD_LIMIT} — slots full.
        </Text>
      </View>
    );
  }

  return null;
}
