import { Pressable, Text, View } from "react-native";

import { companionPhaseLabel } from "../../core/companionLabels";
import type { DeepSynthesisJobState } from "../../core/askDeepSynthesisJob";
import { Notice } from "../Notice";
import { styles } from "../styles";
import { SynthesisReportCard } from "./SynthesisReportCard";

type SynthesisJobPanelProps = {
  jobState: DeepSynthesisJobState;
  onDismiss: () => void;
  onRetry?: () => void;
};

export function SynthesisJobPanel({ jobState, onDismiss, onRetry }: SynthesisJobPanelProps) {
  if (jobState.status === "idle") {
    return null;
  }

  if (jobState.status === "starting") {
    return (
      <View style={styles.chatReadCard}>
        <Text style={styles.sectionTitle}>Deep synthesis</Text>
        <Text style={styles.helpText}>Synthesizing this thread…</Text>
      </View>
    );
  }

  if (jobState.status === "polling") {
    const phaseLabel = jobState.phase
      ? companionPhaseLabel(jobState.phase)
      : "Synthesizing this thread…";
    return (
      <View style={styles.chatReadCard}>
        <Text style={styles.sectionTitle}>Deep synthesis</Text>
        <Text style={styles.helpText}>{phaseLabel}</Text>
      </View>
    );
  }

  if (jobState.status === "failed") {
    return (
      <View style={{ gap: 8 }}>
        <Notice kind="error" message={jobState.message} />
        <View style={styles.chatThreadToolbar}>
          <Pressable style={styles.smallButton} onPress={onDismiss}>
            <Text style={styles.smallButtonText}>Dismiss</Text>
          </Pressable>
          {jobState.canRetry && onRetry ? (
            <Pressable style={styles.smallButton} onPress={onRetry}>
              <Text style={styles.smallButtonText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <SynthesisReportCard
      result={jobState.result}
      stale={jobState.isStale}
      onDismiss={onDismiss}
    />
  );
}
