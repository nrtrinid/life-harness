import { Text, View } from "react-native";

import { ACTIVE_CARD_LIMIT, getActiveLimitStatus } from "../core/guards";
import { useBoardState } from "../state/lifeHarnessHooks";
import { styles } from "./styles";

export function ActiveLimitBanner() {
  const { cards } = useBoardState();
  const activeLimit = getActiveLimitStatus(cards);

  if (activeLimit.isOverLimit) {
    return (
      <View style={styles.bannerWarning}>
        <Text style={styles.bannerWarningText}>
          Active {activeLimit.count}/{ACTIVE_CARD_LIMIT}: choose one to park so the board can breathe.
        </Text>
      </View>
    );
  }

  if (activeLimit.isAtLimit) {
    return (
      <View style={styles.bannerInfo}>
        <Text style={styles.bannerInfoText}>
          Active {activeLimit.count}/{ACTIVE_CARD_LIMIT}: focus slots are full.
        </Text>
      </View>
    );
  }

  return null;
}
