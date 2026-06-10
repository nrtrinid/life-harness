import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

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
import { formatFitScore, getSuggestedResumeModules } from "../src/core/jobScout";
import type { JobCandidateStatus } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const STATUS_ORDER: JobCandidateStatus[] = ["new", "saved", "dismissed", "card_created"];

export default function JobCandidatesScreen() {
  const router = useRouter();
  const {
    jobCandidates,
    jobSources,
    resumeModules,
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
        return (
          <Section
            key={status}
            title={`${JOB_CANDIDATE_STATUS_LABELS[status]} (${grouped.length})`}
          >
            {grouped.length === 0 ? (
              <Text style={styles.emptyText}>Nothing here.</Text>
            ) : (
              grouped.map((candidate) => {
                const source = jobSources.find((item) => item.id === candidate.sourceId);
                const suggested = getSuggestedResumeModules(candidate, resumeModules, 3);
                return (
                  <View key={candidate.id} style={styles.cardTile}>
                    <Text style={styles.titleText}>
                      {candidate.company} — {candidate.roleTitle}
                    </Text>
                    <Text style={styles.bodyText}>{formatFitScore(candidate.fitScore)}</Text>
                    <Text style={styles.helpText}>
                      {JOB_CANDIDATE_ORIGIN_LABELS[candidate.origin]}
                      {source ? ` · ${source.name}` : ""} · {candidate.nextTinyAction}
                    </Text>
                    {suggested.length > 0 ? (
                      <Text style={styles.bodyText}>
                        Modules: {suggested.map((module) => module.title).join(", ")}
                      </Text>
                    ) : null}
                    <View style={styles.cardActions}>
                      {candidate.status !== "card_created" ? (
                        <>
                          <Pressable
                            style={styles.primaryAction}
                            onPress={() => handleAction("approve", candidate.id)}
                          >
                            <Text style={styles.primaryActionText}>Approve to Application Card</Text>
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
                        </>
                      ) : candidate.applicationCardId ? (
                        <Link href={`/card/${candidate.applicationCardId}`} asChild>
                          <Pressable style={styles.secondaryAction}>
                            <Text style={styles.secondaryActionText}>Open Application Card</Text>
                          </Pressable>
                        </Link>
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
