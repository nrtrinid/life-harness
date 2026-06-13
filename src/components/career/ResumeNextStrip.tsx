import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  currentResumePipelineStep,
  deriveApplicationResumePrimaryAction
} from "../../core/applicationResumeAction";
import type { ApplicationResumeReadiness } from "../../core/resumeReadiness";
import type { ResumeModuleSection } from "../../core/types";
import { lofiColors, styles } from "../styles";
import { ResumeSectionChecklist } from "./ResumeSectionChecklist";

const READINESS_LABELS = {
  blocked: "Blocked",
  needs_patch: "Needs patch",
  ready_to_export: "Ready to export"
} as const;

interface ResumeNextStripProps {
  readiness: ApplicationResumeReadiness;
  onBuildDocx: () => void;
  onCreateDraftPacket?: () => void;
  onFocusSection?: (section: ResumeModuleSection) => void;
  onPatchModule?: (moduleId: string) => void;
}

function stepStyle(active: boolean) {
  return StyleSheet.flatten([
    styles.helpText,
    active ? { color: lofiColors.actionAmber, fontWeight: "600" as const } : null
  ]);
}

export function ResumeNextStrip({
  readiness,
  onBuildDocx,
  onCreateDraftPacket,
  onFocusSection,
  onPatchModule
}: ResumeNextStripProps) {
  const canExport = readiness.exportReadiness.canExportDocx;
  const step = currentResumePipelineStep(readiness);
  const primaryAction = deriveApplicationResumePrimaryAction(readiness);

  return (
    <View style={[styles.lofiCardHero, { borderLeftColor: lofiColors.actionAmber, borderLeftWidth: 3 }]}>
      <Text style={styles.lofiTapeLabel}>Resume next</Text>
      <ResumeSectionChecklist readiness={readiness} />
      <Text style={stepStyle(step === "pick")}>1 Pick modules</Text>
      <Text style={stepStyle(step === "patch")}>2 Patch gaps</Text>
      <Text style={stepStyle(step === "export")}>3 Export DOCX</Text>
      <Text style={[styles.titleText, { marginTop: 8 }]}>{READINESS_LABELS[readiness.status]}</Text>
      <Text style={styles.bodyText}>{readiness.nextTinyResumeAction}</Text>
      <Text style={styles.helpText}>
        {canExport
          ? "Can export DOCX for manual review."
          : (readiness.exportReadiness.reason ?? "Resolve blockers before export.")}
      </Text>
      <View style={styles.cardActionsRow}>
        {primaryAction.kind === "create_packet" && onCreateDraftPacket ? (
          <Pressable style={styles.primaryAction} onPress={onCreateDraftPacket}>
            <Text style={styles.primaryActionText}>{primaryAction.label}</Text>
          </Pressable>
        ) : primaryAction.kind === "focus_section" && primaryAction.focusSection && onFocusSection ? (
          <Pressable
            style={styles.primaryAction}
            onPress={() => onFocusSection(primaryAction.focusSection!)}
          >
            <Text style={styles.primaryActionText}>{primaryAction.label}</Text>
          </Pressable>
        ) : primaryAction.kind === "patch_module" && primaryAction.moduleId && onPatchModule ? (
          <Pressable
            style={styles.primaryAction}
            onPress={() => onPatchModule(primaryAction.moduleId!)}
          >
            <Text style={styles.primaryActionText}>{primaryAction.label}</Text>
          </Pressable>
        ) : primaryAction.kind === "patch_module" ? (
          <Link href="/resume-bank" asChild>
            <Pressable style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>Open Resume Bank</Text>
            </Pressable>
          </Link>
        ) : primaryAction.kind === "export" ? (
          <Pressable
            style={StyleSheet.flatten([styles.primaryAction, !canExport ? { opacity: 0.5 } : null])}
            onPress={onBuildDocx}
            disabled={!canExport}
          >
            <Text style={styles.primaryActionText}>{primaryAction.label}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryAction}>
            <Text style={styles.primaryActionText}>{primaryAction.label}</Text>
          </Pressable>
        )}
        {primaryAction.kind === "export" && canExport ? (
          <Link href="/resume-bank" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Resume Bank</Text>
            </Pressable>
          </Link>
        ) : null}
        {primaryAction.kind !== "create_packet" ? (
          <Link href="/career-pack" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Career Pack</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </View>
  );
}
