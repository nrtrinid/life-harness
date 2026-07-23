import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PageHeader } from "../src/components/PageHeader";
import { Notice } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { MemorySensitivityPicker } from "../src/components/memoryBank/MemorySensitivityPicker";
import { styles } from "../src/components/styles";
import { groupMemoryItemsByKind } from "../src/core/harnessMemoryBank";
import { nowIso } from "../src/core/ids";
import type { HarnessMemoryKind } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const MEMORY_KIND_LABELS: Record<HarnessMemoryKind, string> = {
  pattern: "Pattern",
  preference: "Preference",
  trap: "Trap",
  identity: "Identity",
  project_fact: "Project fact",
  decision: "Decision",
  rule: "Rule"
};

const MEMORY_KIND_ORDER: HarnessMemoryKind[] = [
  "pattern",
  "trap",
  "rule",
  "decision",
  "preference",
  "identity",
  "project_fact"
];

export default function MemoryBankScreen() {
  const {
    memoryItems,
    toggleMemoryItemActive,
    deleteMemoryItem,
    updateMemoryItem
  } = useLifeHarness();
  const grouped = groupMemoryItemsByKind(memoryItems);

  return (
    <Screen>
      <PageHeader
        title="Memory Bank"
        subtitle="Durable, user-approved memories from saved chat summaries. Active items feed Companion context."
      />
      <Notice kind="info" message="v0.1: save from Companion chat summaries only." />

      {memoryItems.length === 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.bodyText}>
            No memories saved yet. Save a Companion insight when it is reusable.
          </Text>
          <Link href="/ask-harness" asChild>
            <Pressable style={StyleSheet.flatten([styles.primaryAction, { alignSelf: "flex-start" }])}>
              <Text style={styles.primaryActionText}>Open Companion</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        MEMORY_KIND_ORDER.map((kind) => {
          const items = grouped[kind];
          if (items.length === 0) {
            return null;
          }

          return (
            <Section key={kind} title={MEMORY_KIND_LABELS[kind]}>
              {items.map((item) => (
                <View key={item.id} style={styles.cardTile}>
                  <Text style={styles.titleText}>{item.title}</Text>
                  <Text style={styles.bodyText}>
                    {item.isActive ? "Active" : "Inactive"} · {item.createdAt.slice(0, 16).replace("T", " ")}
                  </Text>
                  <Text style={styles.helpText}>{item.summary}</Text>
                  {item.tags.length > 0 ? (
                    <Text style={styles.bodyText}>Tags: {item.tags.join(", ")}</Text>
                  ) : null}
                  {item.sourceChatSummaryId ? (
                    <Text style={styles.helpText}>Source chat: {item.sourceChatSummaryId}</Text>
                  ) : null}
                  <MemorySensitivityPicker
                    value={item.sensitivity === "unclassified" ? null : item.sensitivity}
                    label={`Sensitivity: ${item.sensitivity}`}
                    onChange={(sensitivity) =>
                      updateMemoryItem({
                        ...item,
                        sensitivity,
                        updatedAt: nowIso()
                      })
                    }
                  />
                  <View style={[styles.splitRow, { marginTop: 8 }]}>
                    <Pressable style={styles.smallButton} onPress={() => toggleMemoryItemActive(item.id)}>
                      <Text style={styles.smallButtonText}>
                        {item.isActive ? "Mark inactive" : "Mark active"}
                      </Text>
                    </Pressable>
                    <Pressable style={styles.smallButton} onPress={() => deleteMemoryItem(item.id)}>
                      <Text style={styles.smallButtonText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </Section>
          );
        })
      )}
    </Screen>
  );
}
