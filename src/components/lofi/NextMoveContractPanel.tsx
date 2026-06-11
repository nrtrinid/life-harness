import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { NextMoveSummary } from "../../core/nextMoveContract";
import { styles } from "../styles";

interface NextMoveContractPanelProps {
  summary: NextMoveSummary;
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.nextMoveFieldRow}>
      <Text style={styles.nextMoveFieldLabel}>{label}</Text>
      <Text style={styles.nextMoveFieldValue}>{value}</Text>
    </View>
  );
}

export function NextMoveContractPanel({ summary }: NextMoveContractPanelProps) {
  const primary = summary.primary;
  if (!primary) {
    return null;
  }

  return (
    <View style={styles.nextMovePanel}>
      <Text style={styles.primaryMoveLabel}>Next move</Text>

      <FieldRow label="Move" value={primary.title} />
      <FieldRow label="Why" value={primary.whyNow} />
      <FieldRow label="Do" value={primary.doAction} />
      <FieldRow
        label="Improve"
        value={primary.improveLock ?? "No extra improvement needed."}
      />
      <FieldRow label="Proof after" value={primary.proofOnDone} />
      <FieldRow label="Pressure" value={primary.pressureLabel} />

      {primary.targetRoute ? (
        <View style={styles.primaryMoveActions}>
          <Link href={primary.targetRoute as Href} asChild>
            <Pressable accessibilityRole="button" style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Open</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}

      {summary.backup ? (
        <Text style={styles.nextMoveBackup}>
          Backup move: {summary.backup.title}
        </Text>
      ) : null}
    </View>
  );
}
