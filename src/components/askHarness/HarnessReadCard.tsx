import { Text, View } from "react-native";

import { styles } from "../styles";
import type { ActiveLimitSignal, HarnessContext } from "../../core/harnessContext";
import type { ContextExportMode } from "./types";

interface HarnessReadCardProps {
  contextMode: ContextExportMode;
  context: HarnessContext;
  chatSummaryCount: number;
  memoryItemCount: number;
  activeMemoryCount: number;
  activeLimitSignal: ActiveLimitSignal;
}

function StatusPill({
  label,
  accent = false
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <View style={accent ? styles.chatMetaPillAccent : styles.chatMetaPill}>
      <Text style={accent ? styles.chatMetaPillTextAccent : styles.chatMetaPillText}>{label}</Text>
    </View>
  );
}

export function HarnessReadCard({
  contextMode,
  context,
  chatSummaryCount,
  memoryItemCount,
  activeMemoryCount,
  activeLimitSignal
}: HarnessReadCardProps) {
  const isCompact = contextMode === "compact";
  const showLimitPill = activeLimitSignal.isAtLimit || activeLimitSignal.isOverLimit;

  return (
    <View style={styles.chatReadCard}>
      <Text style={styles.bodyText}>
        Harness is reading your current board context. It can suggest, but it will not change the board.
      </Text>
      <View style={styles.chatStatusRow}>
        <StatusPill label={isCompact ? "Compact context" : "Full context"} accent={isCompact} />
        <StatusPill label={`Cards ${context.cards.length}`} />
        <StatusPill label={`Analyses ${context.recent_analyses.length}`} />
        <StatusPill label={`Memory ${activeMemoryCount}/${memoryItemCount}`} />
        {chatSummaryCount > 0 ? <StatusPill label={`Chat ${chatSummaryCount}`} /> : null}
        {showLimitPill ? (
          <StatusPill
            label={
              activeLimitSignal.isOverLimit
                ? "Over active limit"
                : "At active limit"
            }
            accent
          />
        ) : null}
      </View>
    </View>
  );
}
