import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { FindPreflightSummary } from "../../core/jobFindings";
import { colors, styles } from "../styles";

interface FindPreflightStripProps {
  preflight: FindPreflightSummary;
}

export function FindPreflightStrip({ preflight }: FindPreflightStripProps) {
  return (
    <View
      style={[
        styles.lofiCardQuiet,
        { borderLeftWidth: 3, borderLeftColor: colors.accentPrimary, gap: 6 }
      ]}
    >
      <Text style={styles.lofiTapeLabel}>Source preflight</Text>
      <Text style={styles.bodyText}>{preflight.label}</Text>
      {preflight.weakPass > 0 || preflight.error > 0 ? (
        <Link href={"/job-sources?health=weak_pass" as Href} asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Fix unhealthy sources</Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}
