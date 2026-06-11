import { Link, useLocalSearchParams, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import type { LifeHarnessData } from "../src/core/lifeHarnessData";
import { buildProofLedger, type ProofLedgerSource } from "../src/core/proofLedger";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const SOURCE_LABELS: Record<ProofLedgerSource, string> = {
  proof: "Proof",
  log: "Log",
  agent: "Agent",
  career: "Career",
  resume: "Resume",
  recovery: "Recovery",
  capture: "Capture",
  card: "Card"
};

const FILTER_OPTIONS: Array<{ id: "all" | ProofLedgerSource; label: string }> = [
  { id: "all", label: "All" },
  { id: "agent", label: "Agent" },
  { id: "career", label: "Career" },
  { id: "recovery", label: "Recovery" },
  { id: "capture", label: "Capture" }
];

function harnessDataFromState(state: ReturnType<typeof useLifeHarness>): LifeHarnessData {
  return {
    cards: state.cards,
    logs: state.logs,
    proofItems: state.proofItems,
    dailyState: state.dailyState,
    resumeModules: state.resumeModules,
    jobCandidates: state.jobCandidates,
    jobSources: state.jobSources,
    jobSourceRuns: state.jobSourceRuns,
    chatSummaries: state.chatSummaries,
    memoryItems: state.memoryItems,
    projects: state.projects,
    agentSessions: state.agentSessions,
    featureSprintPlans: state.featureSprintPlans,
    featureSprintRunnerRuns: state.featureSprintRunnerRuns,
    careerSourcePack: state.careerSourcePack
  };
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString();
}

export default function ProofLedgerScreen() {
  const { cardId } = useLocalSearchParams<{ cardId?: string }>();
  const harness = useLifeHarness();
  const [sourceFilter, setSourceFilter] = useState<"all" | ProofLedgerSource>("all");
  const cardFilter = typeof cardId === "string" && cardId.length > 0 ? cardId : undefined;

  const summary = useMemo(
    () =>
      buildProofLedger(harnessDataFromState(harness), {
        source: sourceFilter === "all" ? undefined : sourceFilter,
        cardId: cardFilter
      }),
    [harness, sourceFilter, cardFilter]
  );

  return (
    <Screen>
      <PageHeader
        title="Proof Ledger"
        subtitle={
          cardFilter
            ? `Movement tied to ${harness.cards.find((card) => card.id === cardFilter)?.title ?? "this card"}.`
            : "Everything that counted as movement."
        }
      />

      <View style={styles.cardActionsRow}>
        {FILTER_OPTIONS.map((option) => {
          const active = sourceFilter === option.id;
          return (
            <Pressable
              key={option.id}
              style={StyleSheet.flatten([
                active ? styles.smallButton : styles.secondaryAction,
                active ? { borderWidth: 1, borderColor: "#c9a227" } : undefined,
                { minWidth: 72 }
              ])}
              onPress={() => setSourceFilter(option.id)}
            >
              <Text style={active ? styles.smallButtonText : styles.secondaryActionText}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Section title="Recent movement">
        <Text style={styles.helpText}>
          {summary.totalProof} proof item{summary.totalProof === 1 ? "" : "s"} · {summary.entries.length}{" "}
          ledger entr{summary.entries.length === 1 ? "y" : "ies"}
        </Text>
        {summary.entries.length === 0 ? (
          <View style={{ marginTop: 12, gap: 12 }}>
            <Text style={styles.emptyText}>
              No movement logged yet. Use Quick Capture on Today after one small move.
            </Text>
            <Link href="/" asChild>
              <Pressable style={StyleSheet.flatten([styles.primaryAction, { alignSelf: "flex-start" }])}>
                <Text style={styles.primaryActionText}>Open Today</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          summary.recent.map((entry) => (
            <View key={entry.id} style={{ marginTop: 12 }}>
              <Text style={styles.listItem}>▸ {entry.title}</Text>
              {entry.summary ? <Text style={styles.helpText}>{entry.summary}</Text> : null}
              <Text style={styles.helpText}>
                {[SOURCE_LABELS[entry.source], entry.cardTitle, formatTimestamp(entry.timestamp)]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {entry.route ? (
                <Link href={entry.route as Href} asChild>
                  <Pressable style={[styles.secondaryAction, { marginTop: 8, alignSelf: "flex-start" }]}>
                    <Text style={styles.secondaryActionText}>
                      {entry.cardTitle ? `Open ${entry.cardTitle}` : "Open card"}
                    </Text>
                  </Pressable>
                </Link>
              ) : null}
            </View>
          ))
        )}
      </Section>

      <Section title="By source">
        {(Object.keys(SOURCE_LABELS) as ProofLedgerSource[])
          .filter((source) => summary.bySource[source] > 0)
          .map((source) => (
            <Text key={source} style={styles.listItem}>
              ▸ {SOURCE_LABELS[source]}: {summary.bySource[source]}
            </Text>
          ))}
        {summary.entries.length === 0 ? (
          <Text style={styles.emptyText}>No source counts yet.</Text>
        ) : null}
      </Section>

      {summary.entries.length > 0 ? (
        <View style={styles.cardActionsRow}>
          <Link href="/" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Today</Text>
            </Pressable>
          </Link>
          <Link href="/progress" asChild>
            <Pressable style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Playback</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </Screen>
  );
}
