import { Link } from "expo-router";
import { Pressable, Text } from "react-native";

import { ActiveLimitBanner } from "../src/components/ActiveLimitBanner";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import { buildWeeklyReviewSummary } from "../src/core/weeklyReview";
import { useLifeHarness } from "../src/state/LifeHarnessState";

export default function ReviewScreen() {
  const state = useLifeHarness();
  const summary = buildWeeklyReviewSummary(state);

  return (
    <Screen>
      <PageHeader title="Replay" subtitle="Weekly recap from logs and card state." />
      <ActiveLimitBanner />

      <Section title="This week">
        <Text style={styles.listItem}>▸ {summary.starts} starts logged</Text>
        <Text style={styles.listItem}>▸ {summary.pounces} pounces completed</Text>
        <Text style={styles.listItem}>▸ {summary.recoveries} recoveries</Text>
        <Text style={styles.listItem}>▸ {summary.proofCount} proof items created</Text>
        <Text style={styles.listItem}>
          ▸ {summary.dormantCards.length} dormant active card
          {summary.dormantCards.length === 1 ? "" : "s"}
        </Text>
        <Text style={styles.listItem}>
          ▸ Active {summary.activeCount}/{summary.activeLimit}
        </Text>
        {summary.bestProof ? (
          <Text style={styles.listItem}>▸ Best proof: "{summary.bestProof}"</Text>
        ) : (
          <Text style={styles.emptyText}>No proof logged this week yet.</Text>
        )}
        {summary.dormantCards.map((card) => (
          <Link key={card.id} href={`/card/${card.id}`} asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.listItem}>▸ Dormant: {card.title}</Text>
            </Pressable>
          </Link>
        ))}
      </Section>

      <Section title="One Patch">
        <Text style={styles.titleText}>{summary.suggestedPatch}</Text>
        <Text style={[styles.helpText, { marginTop: 8 }]}>
          One small rule tweak for next week — not a guilt trip.
        </Text>
      </Section>
    </Screen>
  );
}
