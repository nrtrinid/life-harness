import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { CardStateButtons } from "../../src/components/CardStateButtons";
import { Notice, type NoticeState } from "../../src/components/Notice";
import { ProgressBar } from "../../src/components/ProgressBar";
import { Screen } from "../../src/components/Screen";
import { Section } from "../../src/components/Section";
import { styles } from "../../src/components/styles";
import sampleProfile from "../../fixtures/resume/profile.sample.json";
import { buildApplicationResumeDocxDraft } from "../../src/core/applicationResumeExport";
import { AREA_LABELS, CARD_STATE_LABELS, ROLE_TYPE_LABELS, WARMTH_LABELS } from "../../src/core/labels";
import { computeCardProgress } from "../../src/core/progress";
import { packResumeDocxBlob, type ResumeProfile } from "../../src/core/resumeDocx";
import { RESUME_MODULE_SECTION_LABELS } from "../../src/core/resumeModuleBank";
import { computeCardWarmth } from "../../src/core/warmth";
import { useLifeHarness } from "../../src/state/LifeHarnessState";

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cards, logs, proofItems, dailyState, resumeModules } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
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
  const resumeDraftPacket = card.careerApplication?.resumeDraftPacket;
  const moduleById = new Map(resumeModules.map((module) => [module.id, module]));

  function showNotice(kind: NoticeState["kind"], message: string) {
    setNotice({ kind, message });
    setTimeout(() => setNotice(null), 5000);
  }

  async function handleBuildResumeDocx() {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      showNotice("warning", "Resume DOCX export is web-only for now.");
      return;
    }
    const result = buildApplicationResumeDocxDraft(
      card!,
      resumeModules,
      sampleProfile as ResumeProfile
    );
    if (!result.ok) {
      showNotice("warning", `Cannot export resume: ${result.errors.join(" ")}`);
      return;
    }

    const blob = await packResumeDocxBlob(result.draft);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice("success", "Resume DOCX downloaded.");
  }

  return (
    <Screen>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
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
          {resumeDraftPacket ? (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Resume Draft Packet</Text>
              <Text style={styles.bodyText}>{resumeDraftPacket.nextTinyAction}</Text>
              <Pressable style={styles.secondaryAction} onPress={handleBuildResumeDocx}>
                <Text style={styles.secondaryActionText}>Build Resume DOCX</Text>
              </Pressable>
              <Text style={[styles.label, { marginTop: 12 }]}>Selected Modules</Text>
              {resumeDraftPacket.selectedModuleIds.length === 0 ? (
                <Text style={styles.emptyText}>No modules selected yet.</Text>
              ) : (
                resumeDraftPacket.selectedModuleIds.map((moduleId) => {
                  const module = moduleById.get(moduleId);
                  return (
                    <Text key={moduleId} style={styles.listItem}>
                      - {module?.title ?? moduleId}
                    </Text>
                  );
                })
              )}
              <Text style={[styles.label, { marginTop: 12 }]}>Section Coverage</Text>
              <Text style={styles.bodyText}>
                {resumeDraftPacket.sectionCoverage.length > 0
                  ? resumeDraftPacket.sectionCoverage
                      .map((section) => RESUME_MODULE_SECTION_LABELS[section])
                      .join(", ")
                  : "No sections covered yet."}
              </Text>
              <Text style={[styles.label, { marginTop: 12 }]}>Packet Patches</Text>
              {resumeDraftPacket.missingEvidence.length === 0 ? (
                <Text style={styles.emptyText}>No packet patches flagged.</Text>
              ) : (
                resumeDraftPacket.missingEvidence.slice(0, 5).map((issue) => (
                  <Text key={`${issue.moduleId}-${issue.message}`} style={styles.listItem}>
                    - {issue.moduleTitle}: {issue.message}
                  </Text>
                ))
              )}
            </>
          ) : null}
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
