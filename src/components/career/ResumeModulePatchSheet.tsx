import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { ResumeModulePatch } from "../../core/actions";
import type { ResumeReadinessWarning } from "../../core/resumeReadiness";
import { normalizeResumeModulePlacement } from "../../core/resumeModuleBank";
import type { ResumeModule } from "../../core/types";
import { styles } from "../styles";

interface ResumeModulePatchSheetProps {
  module: ResumeModule;
  blockingWarnings: ResumeReadinessWarning[];
  onPatch: (patch: ResumeModulePatch) => void;
  onClose: () => void;
}

export function ResumeModulePatchSheet({
  module,
  blockingWarnings,
  onPatch,
  onClose
}: ResumeModulePatchSheetProps) {
  const placement = normalizeResumeModulePlacement(module, 0);
  const needsDate = blockingWarnings.some((warning) => warning.category === "missing_date");
  const needsBullet = blockingWarnings.some(
    (warning) => warning.category === "missing_bullets" && placement.section !== "skills"
  );
  const needsSkill = blockingWarnings.some(
    (warning) => warning.category === "missing_bullets" && placement.section === "skills"
  );
  const needsProof = blockingWarnings.some((warning) => warning.category === "missing_proof");

  const [date, setDate] = useState(placement.date ?? "");
  const [bullet, setBullet] = useState("");
  const [skill, setSkill] = useState("");
  const [proof, setProof] = useState("");

  const canSave = useMemo(() => {
    if (needsDate && date.trim()) {
      return true;
    }
    if (needsBullet && bullet.trim()) {
      return true;
    }
    if (needsSkill && skill.trim()) {
      return true;
    }
    if (needsProof && proof.trim()) {
      return true;
    }
    return false;
  }, [needsDate, date, needsBullet, bullet, needsSkill, skill, needsProof, proof]);

  return (
    <View style={[styles.lofiCard, { gap: 12, marginBottom: 12 }]}>
      <Text style={styles.lofiTapeLabel}>Patch module</Text>
      <Text style={styles.titleText}>{module.title}</Text>
      <Text style={styles.helpText}>Add only what is missing for export readiness.</Text>

      {needsDate ? (
        <View>
          <Text style={styles.label}>Resume date</Text>
          <TextInput
            style={styles.captureInput}
            value={date}
            onChangeText={setDate}
            placeholder="e.g. 2025 or Expected 2026"
            placeholderTextColor="rgba(237,232,223,0.35)"
          />
        </View>
      ) : null}

      {needsBullet ? (
        <View>
          <Text style={styles.label}>Add one bullet</Text>
          <TextInput
            style={styles.captureInput}
            value={bullet}
            onChangeText={setBullet}
            placeholder="One resume bullet"
            placeholderTextColor="rgba(237,232,223,0.35)"
          />
        </View>
      ) : null}

      {needsSkill ? (
        <View>
          <Text style={styles.label}>Add one skill</Text>
          <TextInput
            style={styles.captureInput}
            value={skill}
            onChangeText={setSkill}
            placeholder="e.g. TypeScript"
            placeholderTextColor="rgba(237,232,223,0.35)"
          />
        </View>
      ) : null}

      {needsProof ? (
        <View>
          <Text style={styles.label}>Add proof note</Text>
          <TextInput
            style={styles.captureInput}
            value={proof}
            onChangeText={setProof}
            placeholder="Proof reference or note"
            placeholderTextColor="rgba(237,232,223,0.35)"
          />
        </View>
      ) : null}

      <View style={styles.cardActionsRow}>
        <Pressable
          style={[styles.primaryAction, !canSave ? { opacity: 0.5 } : null]}
          disabled={!canSave}
          onPress={() =>
            onPatch({
              ...(needsDate && date.trim() ? { date: date.trim() } : {}),
              ...(needsBullet && bullet.trim() ? { appendBullet: bullet.trim() } : {}),
              ...(needsSkill && skill.trim() ? { appendSkill: skill.trim() } : {}),
              ...(needsProof && proof.trim() ? { appendProof: proof.trim() } : {})
            })
          }
        >
          <Text style={styles.primaryActionText}>Save patch</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={onClose}>
          <Text style={styles.secondaryActionText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}
