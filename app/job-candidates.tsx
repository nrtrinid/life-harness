import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { PageHeader } from "../src/components/PageHeader";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import {
  FIT_SCORE_DISCLAIMER,
  JOB_CANDIDATE_ORIGIN_LABELS,
  JOB_CANDIDATE_STATUS_LABELS
} from "../src/core/labels";
import { formatFitScore } from "../src/core/jobScout";
import type { JobCandidate, JobCandidateStatus } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const STATUS_ORDER: JobCandidateStatus[] = ["new", "saved", "dismissed", "card_created"];

function sortByFitScore(candidates: JobCandidate[]): JobCandidate[] {
  return [...candidates].sort((a, b) => b.fitScore - a.fitScore);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

function openSourceUrl(url: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  void Linking.openURL(url);
}

export default function JobCandidatesScreen() {
  const router = useRouter();
  const {
    jobCandidates,
    jobSources,
    saveJobCandidate,
    dismissJobCandidate,
    approveJobCandidate
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);

  function handleAction(
    action: "save" | "dismiss" | "approve",
    candidateId: string
  ) {
    const result =
      action === "save"
        ? saveJobCandidate(candidateId)
        : action === "dismiss"
          ? dismissJobCandidate(candidateId)
          : approveJobCandidate(candidateId);

    setNotice({
      kind: result.ok ? "success" : "warning",
      message: result.message ?? "Action completed."
    });

    if (action === "approve" && result.ok && "cardId" in result && result.cardId) {
      router.push(`/card/${result.cardId}`);
    }
  }

  return (
    <Screen>
      <Nav />
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <PageHeader
        title="Queue"
        subtitle="Job candidates stay in the queue until you approve them into an application card."
      />
      <Text style={styles.helpText}>{FIT_SCORE_DISCLAIMER}</Text>

      {STATUS_ORDER.map((status) => {
        const grouped = jobCandidates.filter((candidate) => candidate.status === status);
        const sorted =
          status === "new" || status === "saved" ? sortByFitScore(grouped) : grouped;

        return (
          <Section
            key={status}
            title={`${JOB_CANDIDATE_STATUS_LABELS[status]} (${grouped.length})`}
          >
            {grouped.length === 0 ? (
              <Text style={styles.emptyText}>Nothing here.</Text>
            ) : (
              sorted.map((candidate) => {
                const source = jobSources.find((item) => item.id === candidate.sourceId);
                const locationSuffix = candidate.location ? ` · ${candidate.location}` : "";
                const topReasons = candidate.fitReasons.slice(0, 2);
                const topGap = candidate.gaps[0];
                const skillsLine =
                  candidate.matchedSkills && candidate.matchedSkills.length > 0
                    ? candidate.matchedSkills.slice(0, 6).join(", ")
                    : null;

                return (
                  <View key={candidate.id} style={styles.cardTile}>
                    <Text style={styles.titleText}>
                      {candidate.company} — {candidate.roleTitle}
                      {locationSuffix}
                    </Text>
                    <Text style={styles.bodyText}>
                      {formatFitScore(candidate.fitScore, candidate.fitLabel)}
                    </Text>
                    {topReasons.map((reason) => (
                      <Text key={reason} style={styles.listItem}>
                        ▸ {truncate(reason, 120)}
                      </Text>
                    ))}
                    {topGap ? (
                      <Text style={[styles.listItem, { opacity: 0.85 }]}>
                        △ {truncate(topGap, 120)}
                      </Text>
                    ) : null}
                    {skillsLine ? (
                      <Text style={styles.helpText}>Skills: {truncate(skillsLine, 100)}</Text>
                    ) : null}
                    {candidate.recommendedResumeAngle ? (
                      <Text style={styles.helpText}>
                        Angle: {truncate(candidate.recommendedResumeAngle, 120)}
                      </Text>
                    ) : null}
                    <Text style={styles.helpText}>
                      {JOB_CANDIDATE_STATUS_LABELS[candidate.status]} ·{" "}
                      {JOB_CANDIDATE_ORIGIN_LABELS[candidate.origin]}
                      {source ? ` · ${source.name}` : ""}
                    </Text>
                    <View style={styles.cardActions}>
                      {candidate.status !== "card_created" ? (
                        <>
                          <Pressable
                            style={styles.primaryAction}
                            onPress={() => handleAction("approve", candidate.id)}
                          >
                            <Text style={styles.primaryActionText}>Create Application Card</Text>
                          </Pressable>
                          {candidate.status !== "saved" ? (
                            <Pressable
                              style={styles.secondaryAction}
                              onPress={() => handleAction("save", candidate.id)}
                            >
                              <Text style={styles.secondaryActionText}>Save</Text>
                            </Pressable>
                          ) : null}
                          {candidate.status !== "dismissed" ? (
                            <Pressable
                              style={styles.secondaryAction}
                              onPress={() => handleAction("dismiss", candidate.id)}
                            >
                              <Text style={styles.secondaryActionText}>Dismiss</Text>
                            </Pressable>
                          ) : null}
                          {candidate.sourceUrl ? (
                            <Pressable
                              style={styles.secondaryAction}
                              onPress={() => openSourceUrl(candidate.sourceUrl!)}
                            >
                              <Text style={styles.secondaryActionText}>Open source</Text>
                            </Pressable>
                          ) : null}
                        </>
                      ) : candidate.applicationCardId ? (
                        <>
                          <Text style={styles.helpText}>Application card exists.</Text>
                          <Link href={`/card/${candidate.applicationCardId}`} asChild>
                            <Pressable style={styles.secondaryAction}>
                              <Text style={styles.secondaryActionText}>Open Application Card</Text>
                            </Pressable>
                          </Link>
                        </>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </Section>
        );
      })}
    </Screen>
  );
}
