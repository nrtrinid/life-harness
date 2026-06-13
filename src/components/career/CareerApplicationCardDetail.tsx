import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import type { ResumeModulePatch } from "../../core/actions";
import { CardAgentToolsSection } from "../card/CardAgentToolsSection";
import { CardStateButtons } from "../CardStateButtons";
import { CollapsibleSection } from "../CollapsibleSection";
import { ProgressBar } from "../ProgressBar";
import { Section } from "../Section";
import { styles } from "../styles";
import { ApplicationResumeModulePicker } from "./ApplicationResumeModulePicker";
import { CareerStatusChip } from "./CareerStatusChip";
import { ResumeModulePatchSheet } from "./ResumeModulePatchSheet";
import { ResumeNextStrip } from "./ResumeNextStrip";
import { CARD_STATE_LABELS, ROLE_TYPE_LABELS } from "../../core/labels";
import {
  RESUME_MODULE_SECTION_LABELS,
  RESUME_MODULE_SECTION_ORDER
} from "../../core/resumeModuleBank";
import { computeCardProgress } from "../../core/progress";
import type { ApplicationResumeReadiness } from "../../core/resumeReadiness";
import type {
  JobCandidate,
  LifeCard,
  LifeLogEntry,
  ProofItem,
  ResumeModule,
  ResumeModuleSection
} from "../../core/types";

interface CareerApplicationCardDetailProps {
  card: LifeCard;
  resumeReadiness: ApplicationResumeReadiness;
  resumeModules: ResumeModule[];
  cardProof: ProofItem[];
  logs: LifeLogEntry[];
  sessionStartedAt?: string;
  linkedCandidate?: JobCandidate;
  initialFocusSection?: ResumeModuleSection | null;
  initialPatchModuleId?: string | null;
  onBuildDocx: () => void;
  onCreateDraftPacket?: () => void;
  onToggleModule: (moduleId: string) => void;
  onSetModuleForSection?: (section: ResumeModuleSection, moduleId: string) => void;
  onAddDefaultModules?: () => void;
  onPatchModule: (moduleId: string, patch: ResumeModulePatch) => void;
  onParkCard?: () => void;
  onNotice: (kind: "success" | "warning" | "info", message: string) => void;
}

export function CareerApplicationCardDetail({
  card,
  resumeReadiness,
  resumeModules,
  cardProof,
  logs,
  sessionStartedAt,
  linkedCandidate,
  initialFocusSection,
  initialPatchModuleId,
  onBuildDocx,
  onCreateDraftPacket,
  onToggleModule,
  onSetModuleForSection,
  onAddDefaultModules,
  onPatchModule,
  onParkCard,
  onNotice
}: CareerApplicationCardDetailProps) {
  const application = card.careerApplication!;
  const [jobDescriptionExpanded, setJobDescriptionExpanded] = useState(false);
  const [focusSection, setFocusSection] = useState<ResumeModuleSection | null>(
    initialFocusSection ?? null
  );
  const [patchModuleId, setPatchModuleId] = useState<string | null>(initialPatchModuleId ?? null);
  const selectedModuleIds = application.resumeDraftPacket?.selectedModuleIds ?? [];
  const weakMatch =
    application.roleType === "other" ||
    linkedCandidate?.fitLabel === "bad_fit" ||
    linkedCandidate?.fitLabel === "stretch";

  useEffect(() => {
    if (initialFocusSection) {
      setFocusSection(initialFocusSection);
    }
  }, [initialFocusSection]);

  useEffect(() => {
    if (initialPatchModuleId) {
      setPatchModuleId(initialPatchModuleId);
    }
  }, [initialPatchModuleId]);

  const patchModule = patchModuleId
    ? resumeModules.find((module) => module.id === patchModuleId)
    : undefined;
  const patchWarnings = useMemo(
    () =>
      patchModuleId
        ? resumeReadiness.warnings.filter(
            (warning) =>
              warning.moduleId === patchModuleId &&
              (warning.blocksExport ||
                warning.category === "missing_date" ||
                warning.category === "missing_bullets" ||
                warning.category === "missing_proof")
          )
        : [],
    [patchModuleId, resumeReadiness.warnings]
  );
  const blockingWarnings = resumeReadiness.warnings.filter(
    (warning) =>
      warning.blocksExport &&
      warning.moduleId &&
      (warning.category === "missing_date" ||
        warning.category === "missing_bullets" ||
        warning.category === "missing_proof")
  );

  return (
    <>
      <ResumeNextStrip
        readiness={resumeReadiness}
        onBuildDocx={onBuildDocx}
        onCreateDraftPacket={onCreateDraftPacket}
        onFocusSection={(section) => setFocusSection(section)}
        onPatchModule={(moduleId) => setPatchModuleId(moduleId)}
      />

      {patchModule && patchWarnings.length > 0 ? (
        <ResumeModulePatchSheet
          module={patchModule}
          blockingWarnings={patchWarnings}
          onPatch={(patch) => {
            onPatchModule(patchModule.id, patch);
            setPatchModuleId(null);
          }}
          onClose={() => setPatchModuleId(null)}
        />
      ) : null}

      {application.resumeDraftPacket ? (
        <ApplicationResumeModulePicker
          readiness={resumeReadiness}
          resumeModules={resumeModules}
          selectedModuleIds={selectedModuleIds}
          onToggleModule={onToggleModule}
          onSetModuleForSection={onSetModuleForSection}
          onAddDefaultModules={onAddDefaultModules}
          focusSection={focusSection}
        />
      ) : null}

      {blockingWarnings.length > 0 ? (
        <Section title="Patch gaps">
          {blockingWarnings.slice(0, 5).map((warning) => (
            <View
              key={warning.id}
              style={[styles.cardActionsRow, { marginTop: 6, alignItems: "center" }]}
            >
              <Text style={[styles.bodyText, { flex: 1 }]}>{warning.message}</Text>
              {warning.moduleId ? (
                <Pressable
                  style={styles.smallButton}
                  onPress={() => setPatchModuleId(warning.moduleId!)}
                >
                  <Text style={styles.smallButtonText}>Fix</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </Section>
      ) : null}

      <Section title="Move">
        <ProgressBar value={computeCardProgress(card, logs, sessionStartedAt)} />
        <Text style={styles.label}>Why it matters</Text>
        <Text style={styles.bodyText}>{card.whyItMatters}</Text>
        <CardStateButtons cardId={card.id} currentState={card.state} />
      </Section>

      <Section title="Next tiny action">
        <Text style={styles.titleText}>{card.nextTinyAction}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Done for now</Text>
        <Text style={styles.bodyText}>{card.doneForNow}</Text>
      </Section>

      {weakMatch ? (
        <Section title="Fit check">
          <Text style={styles.bodyText}>
            Passing is fine — only build DOCX if you are investing time in this role. Open the
            posting to decide whether to tailor manually on the employer site.
          </Text>
          {linkedCandidate?.gaps.slice(0, 3).map((gap) => (
            <Text key={gap} style={styles.listItem}>
              - {gap}
            </Text>
          ))}
          <View style={[styles.cardActionsRow, { marginTop: 12 }]}>
            {application.sourceUrl ? (
              <Pressable
                style={styles.secondaryAction}
                onPress={() => {
                  void Linking.openURL(application.sourceUrl!).catch(() => {
                    onNotice("warning", "Could not open posting URL.");
                  });
                }}
              >
                <Text style={styles.secondaryActionText}>Open posting</Text>
              </Pressable>
            ) : null}
            {onParkCard ? (
              <Pressable style={styles.smallButton} onPress={onParkCard}>
                <Text style={styles.smallButtonText}>Park this</Text>
              </Pressable>
            ) : null}
          </View>
        </Section>
      ) : null}

      <Section title={`${application.company} — ${application.roleTitle}`}>
        <View style={styles.pageHeaderChips}>
          <CareerStatusChip
            label={CARD_STATE_LABELS[application.applicationStatus]}
            accent={application.applicationStatus === "active"}
          />
          <CareerStatusChip label={ROLE_TYPE_LABELS[application.roleType]} />
          {application.followUpDate ? (
            <CareerStatusChip label={`Follow up ${application.followUpDate}`} accent />
          ) : null}
        </View>
        <Text style={styles.helpText}>
          {card.state} on the board · apply manually on the company site when DOCX is ready
        </Text>
      </Section>

      <CollapsibleSection title="Resume details" defaultOpen={false}>
        <Text style={[styles.label, { marginTop: 0 }]}>Selected modules</Text>
        {RESUME_MODULE_SECTION_ORDER.map((section) => {
          const modules = resumeReadiness.selectedModulesBySection[section];
          return (
            <View key={section} style={{ marginTop: 6 }}>
              <Text style={styles.helpText}>{RESUME_MODULE_SECTION_LABELS[section]}</Text>
              {modules.length === 0 ? (
                <Text style={styles.emptyText}>No selected module.</Text>
              ) : (
                modules.map((module) => (
                  <Text key={module.id} style={styles.listItem}>
                    - {module.title}
                  </Text>
                ))
              )}
            </View>
          );
        })}
        <Text style={[styles.label, { marginTop: 12 }]}>Missing / cautions</Text>
        {resumeReadiness.warnings.length === 0 ? (
          <Text style={styles.emptyText}>No missing evidence or cautions.</Text>
        ) : (
          resumeReadiness.warnings.slice(0, 5).map((warning) => (
            <Text key={warning.id} style={styles.listItem}>
              - {warning.message}
            </Text>
          ))
        )}
        <Text style={[styles.helpText, { marginTop: 8 }]}>
          v0.1 export uses the sample profile fixture for the header until resume profile settings
          ship.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="Posting and angle" defaultOpen={false}>
        {application.sourceUrl ? (
          <>
            <Text style={styles.label}>Source URL</Text>
            <Text style={styles.bodyText}>{application.sourceUrl}</Text>
          </>
        ) : null}
        <Text style={[styles.label, { marginTop: application.sourceUrl ? 12 : 0 }]}>
          Resume angle
        </Text>
        <Text style={styles.bodyText}>{application.resumeAngle}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Projects to emphasize</Text>
        <Text style={styles.bodyText}>{application.projectsToEmphasize}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Bullets / skills to emphasize</Text>
        <Text style={styles.bodyText}>{application.bulletsToEmphasize ?? "(not set)"}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Job description</Text>
        <Text style={styles.bodyText} numberOfLines={jobDescriptionExpanded ? undefined : 6}>
          {application.jobDescription}
        </Text>
        {application.jobDescription.length > 280 ? (
          <Pressable onPress={() => setJobDescriptionExpanded((open) => !open)}>
            <Text style={styles.helpText}>{jobDescriptionExpanded ? "Show less" : "Show full posting"}</Text>
          </Pressable>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection title="Board extras" defaultOpen={false}>
        <View style={styles.splitRow}>
          <View style={styles.splitPanel}>
            <Text style={styles.label}>Do lane</Text>
            <Text style={styles.bodyText}>{card.doLane}</Text>
          </View>
          <View style={styles.splitPanel}>
            <Text style={styles.label}>Improve lane</Text>
            <Text style={styles.bodyText}>{card.improveLane}</Text>
          </View>
        </View>
        <Text style={[styles.label, { marginTop: 12 }]}>Trigger plan</Text>
        <Text style={styles.bodyText}>
          {card.triggerPlan?.cue} → {card.triggerPlan?.action}
        </Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Obstacle plan</Text>
        <Text style={styles.bodyText}>{card.obstaclePlan?.plan}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Recent wins</Text>
        {card.recentWins.length === 0 ? (
          <Text style={styles.emptyText}>No recent wins recorded yet.</Text>
        ) : (
          card.recentWins.map((win) => (
            <Text key={win} style={styles.listItem}>
              ▸ {win}
            </Text>
          ))
        )}
        <Text style={[styles.label, { marginTop: 12 }]}>Optimization parking lot</Text>
        {card.optimizationIdeas.length === 0 ? (
          <Text style={styles.emptyText}>No optimization ideas parked yet.</Text>
        ) : (
          card.optimizationIdeas.map((idea) => (
            <Text key={idea} style={styles.listItem}>
              ▸ {idea}
            </Text>
          ))
        )}
        <Text style={[styles.label, { marginTop: 12 }]}>Proof</Text>
        {cardProof.length === 0 ? (
          <Text style={styles.emptyText}>No proof linked yet.</Text>
        ) : (
          cardProof.map((proof) => (
            <Text key={proof.id} style={styles.listItem}>
              ▸ {proof.title}
            </Text>
          ))
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Agent tools" defaultOpen={false}>
        <CardAgentToolsSection
          card={card}
          layout="embedded"
          showCopyButtons
          onNotice={onNotice}
        />
      </CollapsibleSection>
    </>
  );
}
