import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { colors, styles } from "../src/components/styles";
import { CARD_STATE_LABELS, ROLE_TYPE_LABELS } from "../src/core/labels";
import type { CardState, RoleType } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const INTAKE_STATUSES: CardState[] = ["inbox", "active", "waiting", "done", "killed"];
const ROLE_TYPES = Object.keys(ROLE_TYPE_LABELS) as RoleType[];

export default function CareerIntakeScreen() {
  const router = useRouter();
  const { submitCareerIntake } = useLifeHarness();
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [roleType, setRoleType] = useState<RoleType>("software");
  const [applicationStatus, setApplicationStatus] = useState<CardState>("inbox");
  const [followUpDate, setFollowUpDate] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);

  function handleSubmit() {
    if (!company.trim() || !roleTitle.trim() || !jobDescription.trim()) {
      setNotice({ kind: "warning", message: "Company, role title, and job description are required." });
      return;
    }

    const result = submitCareerIntake({
      company: company.trim(),
      roleTitle: roleTitle.trim(),
      sourceUrl: sourceUrl.trim() || undefined,
      jobDescription: jobDescription.trim(),
      roleType,
      applicationStatus,
      followUpDate: followUpDate.trim() || undefined
    });

    if (result.ok && result.cardId) {
      router.push(`/card/${result.cardId}`);
      return;
    }

    setNotice({
      kind: result.ok ? "success" : "warning",
      message: result.message ?? (result.ok ? "Application card created." : "Could not create card.")
    });
  }

  return (
    <Screen>
      <Nav />
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      <Text style={styles.screenIntro}>
        Paste a job description and create an application card. Default status is Inbox.
      </Text>

      <ScrollView contentContainerStyle={styles.captureWrap}>
        <Section title="Career Intake">
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

          <Text style={[styles.label, { marginTop: 12 }]}>Job Description</Text>
          <TextInput
            style={[styles.captureInput, { minHeight: 120, textAlignVertical: "top" }]}
            value={jobDescription}
            onChangeText={setJobDescription}
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

          <Text style={[styles.label, { marginTop: 12 }]}>Application Status</Text>
          <View style={styles.cardActions}>
            {INTAKE_STATUSES.map((status) => (
              <Pressable
                key={status}
                style={applicationStatus === status ? styles.primaryAction : styles.secondaryAction}
                onPress={() => setApplicationStatus(status)}
              >
                <Text
                  style={
                    applicationStatus === status ? styles.primaryActionText : styles.secondaryActionText
                  }
                >
                  {CARD_STATE_LABELS[status]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Follow-up Date (optional, YYYY-MM-DD)</Text>
          <TextInput
            style={styles.captureInput}
            value={followUpDate}
            onChangeText={setFollowUpDate}
            placeholder="2026-06-15"
            placeholderTextColor={colors.inputPlaceholder}
            autoCapitalize="none"
          />

          <Pressable style={[styles.primaryAction, { marginTop: 16 }]} onPress={handleSubmit}>
            <Text style={styles.primaryActionText}>Create Application Card</Text>
          </Pressable>
        </Section>
      </ScrollView>
    </Screen>
  );
}
