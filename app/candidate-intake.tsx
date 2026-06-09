import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { colors, styles } from "../src/components/styles";
import { FIT_SCORE_DISCLAIMER, ROLE_TYPE_LABELS } from "../src/core/labels";
import { formatFitScore, getSuggestedResumeModules } from "../src/core/jobScout";
import type { RoleType } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const ROLE_TYPES = Object.keys(ROLE_TYPE_LABELS) as RoleType[];

export default function CandidateIntakeScreen() {
  const { jobSources, resumeModules, jobCandidates, submitJobCandidateIntake } = useLifeHarness();
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [roleType, setRoleType] = useState<RoleType>("software");
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [resultCandidateId, setResultCandidateId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const displayedCandidate = jobCandidates.find((candidate) => candidate.id === resultCandidateId);
  const suggested = displayedCandidate
    ? getSuggestedResumeModules(displayedCandidate, resumeModules)
    : [];

  function handleSubmit() {
    if (!company.trim() || !roleTitle.trim() || !description.trim()) {
      setNotice({ kind: "warning", message: "Company, role title, and description are required." });
      return;
    }

    const result = submitJobCandidateIntake({
      company: company.trim(),
      roleTitle: roleTitle.trim(),
      sourceUrl: sourceUrl.trim() || undefined,
      location: location.trim() || undefined,
      description: description.trim(),
      roleType,
      sourceId,
      origin: "manual"
    });

    if (!result.ok) {
      setNotice({ kind: "warning", message: result.message ?? "Could not create candidate." });
      return;
    }

    setResultCandidateId(result.candidateId ?? null);
    setNotice({ kind: "success", message: result.message ?? "Candidate created." });
  }

  return (
    <Screen>
      <Nav />
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <Text style={styles.screenIntro}>
        Paste a job into the candidate queue first. Approval creates the application card later.
      </Text>
      <ScrollView contentContainerStyle={styles.captureWrap}>
        <Section title="Candidate Intake">
          <Text style={styles.label}>Company</Text>
          <TextInput
            style={styles.captureInput}
            value={company}
            onChangeText={setCompany}
            placeholder="Acme Corp"
            placeholderTextColor={colors.inputPlaceholder}
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Role Title</Text>
          <TextInput
            style={styles.captureInput}
            value={roleTitle}
            onChangeText={setRoleTitle}
            placeholder="Software Engineer"
            placeholderTextColor={colors.inputPlaceholder}
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Source URL (optional)</Text>
          <TextInput
            style={styles.captureInput}
            value={sourceUrl}
            onChangeText={setSourceUrl}
            placeholder="https://..."
            placeholderTextColor={colors.inputPlaceholder}
            autoCapitalize="none"
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Location (optional)</Text>
          <TextInput
            style={styles.captureInput}
            value={location}
            onChangeText={setLocation}
            placeholder="Remote"
            placeholderTextColor={colors.inputPlaceholder}
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Job Description</Text>
          <TextInput
            style={[styles.captureInput, { minHeight: 120, textAlignVertical: "top" }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Paste the full job description..."
            placeholderTextColor={colors.inputPlaceholder}
            multiline
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Role Type</Text>
          <View style={styles.cardActions}>
            {ROLE_TYPES.map((type) => (
              <Pressable
                key={type}
                style={roleType === type ? styles.primaryAction : styles.secondaryAction}
                onPress={() => setRoleType(type)}
              >
                <Text style={roleType === type ? styles.primaryActionText : styles.secondaryActionText}>
                  {ROLE_TYPE_LABELS[type]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.label, { marginTop: 12 }]}>Source (optional)</Text>
          <View style={styles.cardActions}>
            <Pressable
              style={!sourceId ? styles.primaryAction : styles.secondaryAction}
              onPress={() => setSourceId(undefined)}
            >
              <Text style={!sourceId ? styles.primaryActionText : styles.secondaryActionText}>None</Text>
            </Pressable>
            {jobSources.map((source) => (
              <Pressable
                key={source.id}
                style={sourceId === source.id ? styles.primaryAction : styles.secondaryAction}
                onPress={() => setSourceId(source.id)}
              >
                <Text
                  style={
                    sourceId === source.id ? styles.primaryActionText : styles.secondaryActionText
                  }
                >
                  {source.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.primaryAction, { marginTop: 16 }]} onPress={handleSubmit}>
            <Text style={styles.primaryActionText}>Create Job Candidate</Text>
          </Pressable>
        </Section>

        {displayedCandidate ? (
          <Section title="Fit Review">
            <Text style={styles.titleText}>{formatFitScore(displayedCandidate.fitScore)}</Text>
            <Text style={styles.helpText}>{FIT_SCORE_DISCLAIMER}</Text>
            <Text style={[styles.label, { marginTop: 12 }]}>Fit Reasons</Text>
            {displayedCandidate.fitReasons.map((reason) => (
              <Text key={reason} style={styles.listItem}>
                ▸ {reason}
              </Text>
            ))}
            <Text style={[styles.label, { marginTop: 12 }]}>Gaps</Text>
            {displayedCandidate.gaps.length === 0 ? (
              <Text style={styles.emptyText}>No major gaps flagged.</Text>
            ) : (
              displayedCandidate.gaps.map((gap) => (
                <Text key={gap} style={styles.listItem}>
                  ▸ {gap}
                </Text>
              ))
            )}
            <Text style={[styles.label, { marginTop: 12 }]}>Suggested Modules</Text>
            {suggested.map((module) => (
              <Text key={module.id} style={styles.listItem}>
                ▸ {module.title}
              </Text>
            ))}
            <Link href="/job-candidates" asChild>
              <Pressable style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>Open Candidates Queue</Text>
              </Pressable>
            </Link>
          </Section>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
