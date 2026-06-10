import { Pressable, Text, View } from "react-native";

import {
  buildSynthesisReportPlainText,
  canCopyTextToClipboard,
  copyTextToClipboard,
} from "../../core/askHarnessSynthesis";
import { CollapsibleSection } from "../CollapsibleSection";
import { Notice } from "../Notice";
import { styles } from "../styles";
import type {
  DeepSynthesisCompletedResult,
  SynthesisCritique,
  SynthesisGroundingRef,
  SynthesisInterpretation,
  SynthesisMemoryProposal
} from "../../core/deepSynthesisTypes";

export type SynthesisReportCardProps = {
  result: DeepSynthesisCompletedResult;
  stale?: boolean;
  onDismiss: () => void;
  showDebugId?: boolean;
};

function GroundingChips({ refs }: { refs: SynthesisGroundingRef[] }) {
  if (refs.length === 0) {
    return null;
  }

  return (
    <View style={styles.chatMetaRow}>
      {refs.map((ref) => (
        <View key={`${ref.kind}:${ref.ref}`} style={styles.chatMetaPill}>
          <Text style={styles.chatMetaPillText}>{ref.label}</Text>
        </View>
      ))}
    </View>
  );
}

function ReportSection({
  title,
  body,
  grounding
}: {
  title: string;
  body: string;
  grounding?: SynthesisGroundingRef[];
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.bodyText}>{body}</Text>
      {grounding ? <GroundingChips refs={grounding} /> : null}
    </View>
  );
}

function MetaNotePills({ notes, accent }: { notes: string[]; accent?: boolean }) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <View style={styles.chatMetaRow}>
      {notes.map((note) => (
        <View key={note} style={accent ? styles.chatMetaPillAccent : styles.chatMetaPill}>
          <Text style={accent ? styles.chatMetaPillTextAccent : styles.chatMetaPillText}>{note}</Text>
        </View>
      ))}
    </View>
  );
}

function hasCritiqueContent(critique: SynthesisCritique): boolean {
  return (
    critique.shallowFlags.length > 0 ||
    critique.missing.length > 0 ||
    critique.avoidance.length > 0 ||
    critique.contradictions.length > 0 ||
    Boolean(critique.revisionBrief?.trim())
  );
}

function CritiqueDetails({ critique }: { critique: SynthesisCritique }) {
  const lines: string[] = [];
  if (critique.shallowFlags.length > 0) {
    lines.push(`Shallow: ${critique.shallowFlags.join("; ")}`);
  }
  if (critique.missing.length > 0) {
    lines.push(`Missing: ${critique.missing.join("; ")}`);
  }
  if (critique.avoidance.length > 0) {
    lines.push(`Avoidance: ${critique.avoidance.join("; ")}`);
  }
  if (critique.contradictions.length > 0) {
    lines.push(`Contradictions: ${critique.contradictions.join("; ")}`);
  }
  lines.push(`Overall: ${critique.overall}`);
  if (critique.revisionBrief?.trim()) {
    lines.push(critique.revisionBrief.trim());
  }

  return (
    <View style={{ gap: 6 }}>
      {lines.map((line) => (
        <Text key={line} style={styles.bodyText}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function InterpretationBlock({ interpretation }: { interpretation: SynthesisInterpretation }) {
  return (
    <View style={{ gap: 4, marginBottom: 8 }}>
      <Text style={styles.chatInspectorSectionTitle}>
        {interpretation.lens} · {interpretation.confidence}
      </Text>
      <Text style={styles.bodyText}>{interpretation.summary}</Text>
      <GroundingChips refs={interpretation.grounding} />
    </View>
  );
}

function MemoryProposalPreview({ proposal }: { proposal: SynthesisMemoryProposal }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.chatMetaRow}>
        <View style={styles.chatMetaPillAccent}>
          <Text style={styles.chatMetaPillTextAccent}>{proposal.kind}</Text>
        </View>
      </View>
      <Text style={styles.bodyText}>{proposal.text}</Text>
    </View>
  );
}

export function SynthesisReportCard({
  result,
  stale = false,
  onDismiss,
  showDebugId = false
}: SynthesisReportCardProps) {
  return (
    <View style={styles.chatReadCard}>
      <View
        style={{
          alignItems: "flex-start",
          flexDirection: "row",
          gap: 8,
          justifyContent: "space-between"
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.sectionTitle}>Deep synthesis</Text>
          <Text style={styles.helpText}>A structured report for this Ask thread.</Text>
        </View>
        <View style={styles.chatThreadToolbar}>
          {canCopyTextToClipboard() ? (
            <Pressable
              style={styles.smallButton}
              onPress={() => {
                void copyTextToClipboard(buildSynthesisReportPlainText(result));
              }}
            >
              <Text style={styles.smallButtonText}>Copy report</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.smallButton} onPress={onDismiss}>
            <Text style={styles.smallButtonText}>Dismiss</Text>
          </Pressable>
        </View>
      </View>

      {stale ? (
        <Notice
          kind="warning"
          message="This synthesis was for an earlier version of the thread."
        />
      ) : null}

      {result.degradedNotes.length > 0 ? (
        <Notice kind="warning" message={result.degradedNotes.join(" ")} />
      ) : null}

      <ReportSection
        title="What we're circling"
        body={result.circling}
        grounding={result.circlingGrounding}
      />
      <ReportSection
        title="Strongest idea"
        body={result.strongestIdea}
        grounding={result.strongestIdeaGrounding}
      />
      <ReportSection
        title="Hidden risk"
        body={result.hiddenRisk}
        grounding={result.hiddenRiskGrounding}
      />

      {result.connections.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.sectionTitle}>Connections</Text>
          {result.connections.map((connection) => (
            <View key={connection} style={styles.synthesisBulletRow}>
              <Text style={styles.bodyText}>• {connection}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.synthesisNextPounceHero}>
        <Text style={styles.sectionTitle}>{result.nextPounce.title}</Text>
        <Text style={styles.bodyText}>{result.nextPounce.smallestAction}</Text>
        {result.nextPounce.cardHint ? (
          <Text style={styles.helpText}>{result.nextPounce.cardHint}</Text>
        ) : null}
        <GroundingChips refs={[result.nextPounce.grounding]} />
      </View>

      {result.memoryProposals.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>Possible memories</Text>
          <Text style={styles.helpText}>Read-only preview — saving comes later.</Text>
          {result.memoryProposals.map((proposal) => (
            <MemoryProposalPreview key={`${proposal.kind}:${proposal.text}`} proposal={proposal} />
          ))}
        </View>
      ) : null}

      {result.interpretations.length > 0 ? (
        <CollapsibleSection title="Interpretations" defaultOpen={false}>
          {result.interpretations.map((interpretation) => (
            <InterpretationBlock key={interpretation.lens} interpretation={interpretation} />
          ))}
        </CollapsibleSection>
      ) : null}

      {result.critique && hasCritiqueContent(result.critique) ? (
        <CollapsibleSection title="Critique" defaultOpen={false}>
          <CritiqueDetails critique={result.critique} />
        </CollapsibleSection>
      ) : null}

      {result.confidenceNotes.length > 0 || result.safetyNotes.length > 0 ? (
        <View style={{ gap: 6 }}>
          <MetaNotePills notes={result.confidenceNotes} />
          <MetaNotePills notes={result.safetyNotes} accent />
        </View>
      ) : null}

      {showDebugId ? (
        <Text style={styles.helpText}>Synthesis id: {result.synthesisId}</Text>
      ) : null}
    </View>
  );
}
