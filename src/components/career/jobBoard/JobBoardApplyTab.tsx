import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { PrimaryMovePanel, SignalStrip, UsefulEmptyState } from "../../AlivePatterns";
import { Section } from "../../Section";
import { styles } from "../../styles";
import { CARD_STATE_LABELS } from "../../../core/labels";
import { buildApplicationResumeReadiness } from "../../../core/resumeReadiness";
import type { JobBoardTab } from "../../../core/jobBoardTab";
import type { LifeCard } from "../../../core/types";
import { useLifeHarness } from "../../../state/LifeHarnessState";

const READINESS_SHORT = {
  blocked: "Blocked",
  needs_patch: "Needs patch",
  ready_to_export: "Ready"
} as const;

interface JobBoardApplyTabProps {
  onSelectTab: (tab: JobBoardTab) => void;
}

function applicationCards(cards: LifeCard[]): LifeCard[] {
  return cards.filter(
    (card) =>
      card.careerApplication &&
      (card.state === "inbox" || card.state === "active" || card.state === "waiting")
  );
}

export function JobBoardApplyTab({ onSelectTab }: JobBoardApplyTabProps) {
  const { cards, resumeModules, jobCandidates, careerSourcePack } = useLifeHarness();
  const applicationSummaries = applicationCards(cards).map((card) => {
    const linkedCandidate = card.careerApplication?.jobCandidateId
      ? jobCandidates.find((candidate) => candidate.id === card.careerApplication?.jobCandidateId)
      : undefined;
    const readiness = buildApplicationResumeReadiness({
      card,
      resumeModules,
      jobCandidate: linkedCandidate,
      careerSourcePack: careerSourcePack?.pack
    });
    return { card, readiness };
  });
  const leadApplication = applicationSummaries[0];
  const remainingApplications = leadApplication
    ? applicationSummaries.filter(({ card }) => card.id !== leadApplication.card.id)
    : applicationSummaries;

  return (
    <View style={{ gap: 12 }}>
      {leadApplication ? (
        <PrimaryMovePanel
          label="Apply next"
          title={leadApplication.card.title}
          reason={leadApplication.readiness.nextTinyResumeAction}
          primaryAction={{
            label: "Open application",
            href: `/card/${leadApplication.card.id}` as Href
          }}
          footnote={leadApplication.card.nextTinyAction}
        >
          <SignalStrip
            label="Readiness"
            text={`${CARD_STATE_LABELS[leadApplication.card.state]} - Resume: ${
              READINESS_SHORT[leadApplication.readiness.status]
            }`}
            tone={leadApplication.readiness.status === "ready_to_export" ? "proof" : "warning"}
          />
        </PrimaryMovePanel>
      ) : (
        <PrimaryMovePanel
          label="Apply next"
          title="No application cards in motion"
          reason="Nothing is ready to apply yet. Review matches first, then start one application."
          primaryAction={{
            label: "Review matches",
            onPress: () => onSelectTab("review")
          }}
          footnote="One real application beats more setup."
        />
      )}

      <Section title={`Other applications (${remainingApplications.length})`}>
        {remainingApplications.length === 0 ? (
          <UsefulEmptyState
            title={leadApplication ? "No other applications in motion" : "Application lane is quiet"}
            copy={
              leadApplication
                ? "Work the application above before adding more."
                : "Review matches to create the next application card."
            }
          />
        ) : (
          remainingApplications.map(({ card, readiness }) => (
            <View key={card.id} style={styles.cardTile}>
              <Text style={styles.titleText}>{card.title}</Text>
              <Text style={styles.bodyText}>
                {CARD_STATE_LABELS[card.state]} - Resume: {READINESS_SHORT[readiness.status]}
              </Text>
              <Text style={styles.helpText}>{readiness.nextTinyResumeAction}</Text>
              <Text style={styles.helpText}>{card.nextTinyAction}</Text>
              <Link href={`/card/${card.id}`} asChild>
                <Pressable style={styles.primaryAction}>
                  <Text style={styles.primaryActionText}>Open application</Text>
                </Pressable>
              </Link>
            </View>
          ))
        )}
      </Section>

      <Section title="Resume prep">
        <Text style={styles.helpText}>Bank and pack stay one tap away while you apply.</Text>
        <View style={styles.cardActionsRow}>
          <Link href="/resume-bank" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Resume Bank</Text>
            </Pressable>
          </Link>
          <Link href="/career-pack" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Career Pack</Text>
            </Pressable>
          </Link>
        </View>
      </Section>
    </View>
  );
}
