import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { BonusTrack } from "../../core/bonusTrack";
import { styles } from "../styles";

const bonusTrackButtonStyle = StyleSheet.flatten([
  styles.secondaryAction,
  { marginTop: 12, alignSelf: "flex-start" as const }
]);

export function BonusTrackCard({ track }: { track: BonusTrack }) {
  return (
    <View style={styles.lofiCardQuiet}>
      <Text style={styles.lofiTapeLabel}>Bonus track</Text>
      <Text style={styles.bodyText}>{track.title}</Text>
      <Text style={[styles.helpText, { marginTop: 6 }]}>{track.reason}</Text>
      {track.targetRoute ? (
        <Link href={track.targetRoute as Href} asChild>
          <Pressable style={bonusTrackButtonStyle}>
            <Text style={styles.secondaryActionText}>{track.ctaLabel ?? "Take it"}</Text>
          </Pressable>
        </Link>
      ) : track.cardId ? (
        <Link href={`/card/${track.cardId}`} asChild>
          <Pressable style={bonusTrackButtonStyle}>
            <Text style={styles.secondaryActionText}>{track.ctaLabel ?? "Take it"}</Text>
          </Pressable>
        </Link>
      ) : (
        <Pressable style={bonusTrackButtonStyle}>
          <Text style={styles.secondaryActionText}>{track.ctaLabel ?? "Take it"}</Text>
        </Pressable>
      )}
    </View>
  );
}
