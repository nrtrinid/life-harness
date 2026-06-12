import { type Href } from "expo-router";
import { Text, View } from "react-native";

import { PrimaryMovePanel, SignalStrip } from "../AlivePatterns";
import type { CareerMorningLoopSummary } from "../../core/careerMorningLoop";
import { styles } from "../styles";

interface CareerMorningLoopCardProps {
  loop: CareerMorningLoopSummary;
  onRunDueSources: () => void;
  onRunAllEnabledSources: () => void;
  batchBusy?: boolean;
}

export function CareerMorningLoopCard({
  loop,
  onRunDueSources,
  onRunAllEnabledSources,
  batchBusy = false
}: CareerMorningLoopCardProps) {
  const { nextMove, statusStrip, supportingLines } = loop;
  const move = nextMove;

  const primaryAction =
    move.kind === "maintain" || move.disabled
      ? move.disabled
        ? {
            label: move.ctaLabel,
            onPress: () => {},
            disabled: true
          }
        : undefined
      : move.batchHandler === "run_due"
        ? {
            label: move.ctaLabel,
            onPress: onRunDueSources,
            disabled: batchBusy
          }
        : move.batchHandler === "run_all_enabled"
          ? {
              label: move.ctaLabel,
              onPress: onRunAllEnabledSources,
              disabled: batchBusy
            }
          : move.href
            ? {
                label: move.ctaLabel,
                href: move.href as Href
              }
            : undefined;

  const secondaryActions =
    move.kind === "maintain"
      ? [{ label: "Check sources", href: "/job-sources" as Href, variant: "secondary" as const }]
      : [];

  return (
    <PrimaryMovePanel
      label="Career check-in"
      title={move.title}
      reason={move.why}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      footnote={supportingLines[0]}
    >
      <SignalStrip label="Status" text={statusStrip} tone="companion" />
      {supportingLines.length > 1 ? (
        <View style={{ gap: 4 }}>
          {supportingLines.slice(1).map((line) => (
            <Text key={line} style={styles.helpText}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </PrimaryMovePanel>
  );
}
