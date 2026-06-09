import { Link, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { CardStateButtons } from "../../src/components/CardStateButtons";
import { ProgressBar } from "../../src/components/ProgressBar";
import { Screen } from "../../src/components/Screen";
import { Section } from "../../src/components/Section";
import { styles } from "../../src/components/styles";
import { AREA_LABELS, CARD_STATE_LABELS, ROLE_TYPE_LABELS, WARMTH_LABELS } from "../../src/core/labels";
import { computeCardProgress } from "../../src/core/progress";
import { computeCardWarmth } from "../../src/core/warmth";
import { useLifeHarness } from "../../src/state/LifeHarnessState";

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cards, logs, proofItems, dailyState } = useLifeHarness();
  const card = cards.find((item) => item.id === id);
  const warmth = card ? computeCardWarmth(card, logs, new Date()) : undefined;

  if (!card) {
    return (
      <Screen>
        <Section title="Card Not Found">
          <Text style={styles.bodyText}>This card does not exist in the current state.</Text>
          <Link href="/board" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Return to Board</Text>
            </Pressable>
          </Link>
        </Section>
      </Screen>
    );
  }

  const cardProof = proofItems.filter((proof) => card.proofItemIds.includes(proof.id));

  return (
    <Screen>
      <Section title={card.title}>
        <Text style={styles.bodyText}>
          {AREA_LABELS[card.area]} · {warmth ? WARMTH_LABELS[warmth] : "unknown"} · {card.state}
        </Text>
        <ProgressBar value={computeCardProgress(card, logs, dailyState.sessionStartedAt)} />
        <Text style={styles.label}>Why It Matters</Text>
        <Text style={styles.bodyText}>{card.whyItMatters}</Text>
        <CardStateButtons cardId={card.id} currentState={card.state} />
      </Section>

      <Section title="Next Tiny Action">
        <Text style={styles.titleText}>{card.nextTinyAction}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Done For Now</Text>
        <Text style={styles.bodyText}>{card.doneForNow}</Text>
      </Section>

      <Section title="Do vs Improve">
        <View style={styles.splitRow}>
          <View style={styles.splitPanel}>
            <Text style={styles.label}>Do Lane</Text>
            <Text style={styles.bodyText}>{card.doLane}</Text>
          </View>
          <View style={styles.splitPanel}>
            <Text style={styles.label}>Improve Lane</Text>
            <Text style={styles.bodyText}>{card.improveLane}</Text>
          </View>
        </View>
      </Section>

      <Section title="Plans">
        <Text style={styles.label}>Trigger Plan</Text>
        <Text style={styles.bodyText}>
          {card.triggerPlan?.cue} → {card.triggerPlan?.action}
        </Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Obstacle Plan</Text>
        <Text style={styles.bodyText}>{card.obstaclePlan?.plan}</Text>
      </Section>

      <Section title="Resume Packet">
        <Text style={styles.label}>Last State</Text>
        <Text style={styles.bodyText}>{card.resumePacket?.lastState}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Re-entry Action</Text>
        <Text style={styles.bodyText}>{card.resumePacket?.reentryAction}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Open Loops</Text>
        {card.resumePacket?.openLoops.length === 0 ? (
          <Text style={styles.emptyText}>No open loops yet.</Text>
        ) : (
          card.resumePacket?.openLoops.map((loop) => (
            <Text key={loop} style={styles.listItem}>
              ▸ {loop}
            </Text>
          ))
        )}
      </Section>

      {card.careerApplication ? (
        <Section title="Career Application">
          <Text style={styles.label}>Company</Text>
          <Text style={styles.bodyText}>{card.careerApplication.company}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Role</Text>
          <Text style={styles.bodyText}>{card.careerApplication.roleTitle}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Role Type</Text>
          <Text style={styles.bodyText}>{ROLE_TYPE_LABELS[card.careerApplication.roleType]}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Status</Text>
          <Text style={styles.bodyText}>
            {CARD_STATE_LABELS[card.careerApplication.applicationStatus]}
          </Text>
          {card.careerApplication.sourceUrl ? (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Source URL</Text>
              <Text style={styles.bodyText}>{card.careerApplication.sourceUrl}</Text>
            </>
          ) : null}
          <Text style={[styles.label, { marginTop: 12 }]}>Resume Angle</Text>
          <Text style={styles.bodyText}>{card.careerApplication.resumeAngle}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Projects to Emphasize</Text>
          <Text style={styles.bodyText}>{card.careerApplication.projectsToEmphasize}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Bullets / Skills to Emphasize</Text>
          <Text style={styles.bodyText}>{card.careerApplication.bulletsToEmphasize ?? "(not set)"}</Text>
          {card.careerApplication.followUpDate ? (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Follow-up Date</Text>
              <Text style={styles.bodyText}>{card.careerApplication.followUpDate}</Text>
            </>
          ) : null}
          {card.careerApplication.jobCandidateId ? (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Linked Candidate</Text>
              <Text style={styles.bodyText}>{card.careerApplication.jobCandidateId}</Text>
            </>
          ) : null}
          <Text style={[styles.label, { marginTop: 12 }]}>Job Description</Text>
          <Text style={styles.bodyText} numberOfLines={8}>
            {card.careerApplication.jobDescription}
          </Text>
        </Section>
      ) : null}

      <Section title="Recent Wins">
        {card.recentWins.length === 0 ? (
          <Text style={styles.emptyText}>No recent wins recorded yet.</Text>
        ) : (
          card.recentWins.map((win) => (
            <Text key={win} style={styles.listItem}>
              ▸ {win}
            </Text>
          ))
        )}
      </Section>

      <Section title="Optimization Parking Lot">
        {card.optimizationIdeas.length === 0 ? (
          <Text style={styles.emptyText}>No optimization ideas parked yet.</Text>
        ) : (
          card.optimizationIdeas.map((idea) => (
            <Text key={idea} style={styles.listItem}>
              ▸ {idea}
            </Text>
          ))
        )}
      </Section>

      <Section title="Proof">
        {cardProof.length === 0 ? (
          <Text style={styles.emptyText}>No proof linked yet.</Text>
        ) : (
          cardProof.map((proof) => (
            <Text key={proof.id} style={styles.listItem}>
              ▸ {proof.title}
            </Text>
          ))
        )}
      </Section>
    </Screen>
  );
}
