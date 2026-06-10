import { Pressable, Text, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { Notice } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import { groupMemoryItemsByKind } from "../src/core/harnessMemoryBank";
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
  const { memoryItems, toggleMemoryItemActive, deleteMemoryItem } = useLifeHarness();
  const grouped = groupMemoryItemsByKind(memoryItems);

  return (
    <Screen>
      <Nav />
      <Text style={styles.screenIntro}>
        Durable, user-approved memories from saved chat summaries. Active items feed Ask Harness context.
      </Text>
      <Notice kind="info" message="v0.1: memories come from chat summary suggestions — no blank editor yet." />

      {memoryItems.length === 0 ? (
        <Section title="Memory Bank">
          <Text style={styles.bodyText}>
            No memories saved yet. Save a chat summary in Ask Harness Dev, then save suggested durable memories.
          </Text>
        </Section>
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
