import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { PrimaryMovePanel, SignalStrip, UsefulEmptyState } from "../../AlivePatterns";
import { Section } from "../../Section";
import { styles } from "../../styles";
import { getFollowUpsDue } from "../../../core/career";
import type { LifeCard } from "../../../core/types";
import { useLifeHarness } from "../../../state/LifeHarnessState";

function followUpMeta(card: LifeCard, now: Date) {
  const dueDate = card.careerApplication?.followUpDate;
  const overdue =
    dueDate && new Date(`${dueDate}T12:00:00`) < new Date(now.toDateString());

  return {
    dueDate,
    overdue,
    label: `${overdue ? "Overdue" : "Due"} - follow-up ${dueDate}`
  };
}

export function JobBoardFollowUpTab() {
  const { cards } = useLifeHarness();
  const now = new Date();
  const followUps = getFollowUpsDue(cards, now);
  const leadFollowUp = followUps[0];
  const remainingFollowUps = leadFollowUp
    ? followUps.filter((card) => card.id !== leadFollowUp.id)
    : followUps;

  return (
    <View style={{ gap: 12 }}>
      {leadFollowUp ? (
        <PrimaryMovePanel
          label="Follow up next"
          title={leadFollowUp.title}
          reason={leadFollowUp.nextTinyAction}
          primaryAction={{
            label: "Open application",
            href: `/card/${leadFollowUp.id}` as Href
          }}
          footnote="One follow-up keeps the loop warm. Send it, log it, then stop."
        >
          <SignalStrip
            label="Due signal"
            text={followUpMeta(leadFollowUp, now).label}
            tone="warning"
          />
        </PrimaryMovePanel>
      ) : (
        <UsefulEmptyState
          title="No follow-ups due"
          copy="Nothing needs a nudge right now. Keep the next career move in the main Jobs panel."
        />
      )}

      <Section title={`Other follow-ups due (${remainingFollowUps.length})`}>
        {remainingFollowUps.length === 0 ? (
          <UsefulEmptyState
            title="No other follow-ups"
            copy={
              leadFollowUp
                ? "Handle the follow-up above and this lane is clear."
                : "This lane is quiet. No outside-world nudge is waiting."
            }
          />
        ) : (
          remainingFollowUps.map((card) => {
            const meta = followUpMeta(card, now);
            return (
              <View key={card.id} style={styles.cardTile}>
                <Text style={styles.titleText}>{card.title}</Text>
                <Text style={styles.bodyText}>{meta.label}</Text>
                <Text style={styles.helpText}>{card.nextTinyAction}</Text>
                <Link href={`/card/${card.id}`} asChild>
                  <Pressable style={styles.primaryAction}>
                    <Text style={styles.primaryActionText}>Open application</Text>
                  </Pressable>
                </Link>
              </View>
            );
          })
        )}
      </Section>
    </View>
  );
}
