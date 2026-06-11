import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { NextMoveSummary } from "../../core/nextMoveContract";
import { styles } from "../styles";

interface NextMoveContractPanelProps {
  summary: NextMoveSummary;
  actMode?: boolean;
}

function FieldRow({
  label,
  value,
  compact = false
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <View style={styles.nextMoveFieldRow}>
      <Text style={compact ? styles.nextMoveFieldLabelCompact : styles.nextMoveFieldLabel}>
        {label}
      </Text>
      <Text style={compact ? styles.nextMoveFieldValueCompact : styles.nextMoveFieldValue}>
        {value}
      </Text>
    </View>
  );
}

export function NextMoveContractPanel({ summary, actMode = false }: NextMoveContractPanelProps) {
  const primary = summary.primary;
  if (!primary) {
    return null;
  }

  const panelStyle = actMode ? styles.nextMovePanelAct : styles.nextMovePanel;

  return (
    <View style={panelStyle}>
      <Text style={styles.primaryMoveLabel}>{actMode ? "Your move" : "Next move"}</Text>

      {actMode ? (
        <>
          <Text style={styles.nextMoveActTitle}>{primary.title}</Text>
          <View style={styles.nextMoveActDoBlock}>
            <Text style={styles.nextMoveActDoLabel}>Why this</Text>
            <Text style={styles.nextMoveActWhy}>{primary.whyNow}</Text>
          </View>
          <View style={styles.nextMoveActDoBlock}>
            <Text style={styles.nextMoveActDoLabel}>Do</Text>
            <Text style={styles.nextMoveActDo}>{primary.doAction}</Text>
          </View>

          {primary.targetRoute ? (
            <View style={styles.primaryMoveActions}>
              <Link href={primary.targetRoute as Href} asChild>
                <Pressable accessibilityRole="button" style={styles.primaryAction}>
                  <Text style={styles.primaryActionText}>Open</Text>
                </Pressable>
              </Link>
            </View>
          ) : null}

          <View style={styles.nextMoveActMeta}>
            <FieldRow
              label="Improve"
              value={primary.improveLock ?? "No extra improvement needed."}
              compact
            />
            <FieldRow label="Proof after" value={primary.proofOnDone} compact />
            <FieldRow label="Pressure" value={primary.pressureLabel} compact />
          </View>
        </>
      ) : (
        <>
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
        </>
      )}

      {summary.backup ? (
        <Text style={styles.nextMoveBackup}>Backup move: {summary.backup.title}</Text>
      ) : null}
    </View>
  );
}
