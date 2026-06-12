import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { CardAgentToolsSection } from "../card/CardAgentToolsSection";
import { CollapsibleSection } from "../CollapsibleSection";
import { Section } from "../Section";
import { styles } from "../styles";
import { CareerStatusChip } from "./CareerStatusChip";
import { ResumeNextStrip } from "./ResumeNextStrip";
import { CARD_STATE_LABELS, ROLE_TYPE_LABELS } from "../../core/labels";
import {
  RESUME_MODULE_SECTION_LABELS,
  RESUME_MODULE_SECTION_ORDER
} from "../../core/resumeModuleBank";
import type { ApplicationResumeReadiness } from "../../core/resumeReadiness";
import type { JobCandidate, LifeCard, ProofItem } from "../../core/types";

interface CareerApplicationCardDetailProps {
  card: LifeCard;
  resumeReadiness: ApplicationResumeReadiness;
  cardProof: ProofItem[];
  linkedCandidate?: JobCandidate;
  onBuildDocx: () => void;
  onCreateDraftPacket?: () => void;
  onNotice: (kind: "success" | "warning" | "info", message: string) => void;
}

export function CareerApplicationCardDetail({
  card,
  resumeReadiness,
  cardProof,
  linkedCandidate,
  onBuildDocx,
  onCreateDraftPacket,
  onNotice
}: CareerApplicationCardDetailProps) {
  const application = card.careerApplication!;
  const [jobDescriptionExpanded, setJobDescriptionExpanded] = useState(false);
  const weakMatch =
    application.roleType === "other" ||
    linkedCandidate?.fitLabel === "bad_fit" ||
    linkedCandidate?.fitLabel === "stretch";

  return (
    <>
      <ResumeNextStrip
        readiness={resumeReadiness}
        onBuildDocx={onBuildDocx}
        onCreateDraftPacket={onCreateDraftPacket}
      />

      {weakMatch ? (
        <Section title="Fit check">
          <Text style={styles.bodyText}>
            This posting is probably not a tech-role match for your current resume bank. Auto-suggested
            projects and angles may not apply — open the listing, then tailor manually or pass.
          </Text>
          {linkedCandidate?.gaps.slice(0, 3).map((gap) => (
            <Text key={gap} style={styles.listItem}>
              - {gap}
            </Text>
          ))}
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
