import { Text, View } from "react-native";

import type { FeatureSprintActionGuideStep } from "../../core/featureSprintActionGuide";
import { colors, styles } from "../styles";

function marker(status: FeatureSprintActionGuideStep["status"]): string {
  if (status === "done") {
    return "OK";
  }
  if (status === "current") {
    return ">";
  }
  return "·";
}

function markerColor(status: FeatureSprintActionGuideStep["status"]): string {
  if (status === "done") {
    return colors.accentSuccess;
  }
  if (status === "current") {
    return colors.accentPrimary;
  }
  return colors.textMuted;
}

export function FeatureSprintActionGuide({
  steps,
  title = "Do this next"
}: {
  steps: FeatureSprintActionGuideStep[];
  title?: string;
}) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.cardTile,
        {
          marginTop: 12,
          borderColor: colors.accentPrimary,
          borderWidth: 1
        }
      ]}
    >
      <Text style={styles.label}>{title}</Text>
      <View style={{ gap: 6, marginTop: 8 }}>
        {steps.map((guideStep, index) => (
          <Text key={guideStep.id} style={styles.bodyText}>
            <Text style={{ color: markerColor(guideStep.status), fontWeight: "700" }}>
              {marker(guideStep.status)}
            </Text>{" "}
            {index + 1}. {guideStep.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
