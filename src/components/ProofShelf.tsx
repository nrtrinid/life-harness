import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { buildProofShelfEntries } from "../core/proof";
import { useLifeHarness } from "../state/LifeHarnessState";
import { questCardAreaAccentColor, styles } from "./styles";

interface ProofShelfProps {
  compact?: boolean;
  limit?: number;
  rescueOnly?: boolean;
  showLedgerLink?: boolean;
}

export function ProofShelf({
  compact = false,
  limit,
  rescueOnly = false,
  showLedgerLink = false
}: ProofShelfProps) {
  const { cards, logs, proofItems } = useLifeHarness();
  let entries = buildProofShelfEntries(proofItems, cards, logs);

  if (rescueOnly) {
    entries = entries.filter((entry) => entry.rescueKind);
  }

  if (limit !== undefined) {
    entries = entries.slice(0, limit);
  }

  if (entries.length === 0) {
    return (
      <View>
        <Text style={styles.emptyText}>No proof yet. Capture a win on Today or preserve the day.</Text>
        {showLedgerLink ? (
          <Link href="/proof-ledger" asChild>
            <Pressable style={[styles.secondaryAction, { marginTop: 12, alignSelf: "flex-start" }]}>
              <Text style={styles.secondaryActionText}>View ledger</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.proofShelf}>
      {!compact ? <Text style={styles.helpText}>Evidence, not raw history.</Text> : null}
      {entries.map((entry) => {
        const itemStyle = [
          styles.proofShelfItem,
          entry.area ? { borderLeftColor: questCardAreaAccentColor(entry.area) } : undefined
        ];
        const content = (
          <>
            <Text style={styles.listItem}>▸ {entry.title}</Text>
            <Text style={styles.helpText}>
              {[entry.areaLabel, entry.cardTitle, entry.rescueKind ? `Rescue: ${entry.rescueKind}` : undefined]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </>
        );

        if (entry.cardId) {
          return (
            <Link key={entry.id} href={`/card/${entry.cardId}`} asChild>
              <Pressable style={itemStyle} accessibilityRole="link">
                {content}
              </Pressable>
            </Link>
          );
        }

        return (
          <View key={entry.id} style={itemStyle}>
            {content}
          </View>
        );
      })}
      {showLedgerLink ? (
        <Link href="/proof-ledger" asChild>
          <Pressable style={[styles.secondaryAction, { marginTop: 12, alignSelf: "flex-start" }]}>
            <Text style={styles.secondaryActionText}>View ledger</Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}
