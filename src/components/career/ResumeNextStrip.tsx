import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ApplicationResumeReadiness } from "../../core/resumeReadiness";
import { lofiColors, styles } from "../styles";

const READINESS_LABELS = {
  blocked: "Blocked",
  needs_patch: "Needs patch",
  ready_to_export: "Ready to export"
} as const;

interface ResumeNextStripProps {
  readiness: ApplicationResumeReadiness;
  onBuildDocx: () => void;
  onCreateDraftPacket?: () => void;
}

export function ResumeNextStrip({
  readiness,
  onBuildDocx,
  onCreateDraftPacket
}: ResumeNextStripProps) {
  const canExport = readiness.exportReadiness.canExportDocx;
  const missingPacket = readiness.exportReadiness.reason === "Application card has no resume draft packet.";

  return (
    <View style={[styles.lofiCardHero, { borderLeftColor: lofiColors.actionAmber, borderLeftWidth: 3 }]}>
      <Text style={styles.lofiTapeLabel}>Resume next</Text>
      <Text style={styles.titleText}>{READINESS_LABELS[readiness.status]}</Text>
      <Text style={styles.bodyText}>{readiness.nextTinyResumeAction}</Text>
      <Text style={styles.helpText}>
        {canExport
          ? "Can export DOCX for manual review."
          : (readiness.exportReadiness.reason ?? "Resolve blockers before export.")}
      </Text>
      <View style={styles.cardActionsRow}>
        {missingPacket && onCreateDraftPacket ? (
          <Pressable style={styles.primaryAction} onPress={onCreateDraftPacket}>
            <Text style={styles.primaryActionText}>Create draft packet</Text>
          </Pressable>
        ) : (
          <Pressable
            style={StyleSheet.flatten([styles.primaryAction, !canExport ? { opacity: 0.7 } : null])}
            onPress={onBuildDocx}
          >
            <Text style={styles.primaryActionText}>Build Resume DOCX</Text>
          </Pressable>
        )}
        <Link href="/resume-bank" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Resume Bank</Text>
          </Pressable>
        </Link>
        <Link href="/career-pack" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Career Pack</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}
