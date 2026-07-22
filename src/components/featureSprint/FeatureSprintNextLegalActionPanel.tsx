import { Pressable, Text, View } from "react-native";

import {
  FEATURE_SPRINT_LEGAL_ACTION_LABELS,
  formatFeatureSprintLegalActionFailure,
  type FeatureSprintNextLegalActionPresentation
} from "../../core/featureSprintManualKernelBridge";
import { colors, styles } from "../styles";

function modeLabel(mode: FeatureSprintNextLegalActionPresentation["mode"]): string {
  return mode === "kernel_managed" ? "Kernel-managed" : "Legacy manual";
}

function modeColor(mode: FeatureSprintNextLegalActionPresentation["mode"]): string {
  return mode === "kernel_managed" ? colors.accentPrimary : colors.textMuted;
}

function triggerLabel(presentation: FeatureSprintNextLegalActionPresentation): string {
  if (!presentation.next) {
    return "Unavailable";
  }
  if (presentation.next.action === "terminal_complete") {
    return "Sprint complete";
  }
  if (presentation.next.action === "human_hold") {
    return "Held for human";
  }
  if (presentation.category === "worker_launch") {
    return `Launch ${FEATURE_SPRINT_LEGAL_ACTION_LABELS[presentation.next.action]}`;
  }
  return `Apply ${presentation.label}`;
}

export function FeatureSprintNextLegalActionPanel({
  presentation,
  isTriggering = false,
  onTrigger
}: {
  presentation: FeatureSprintNextLegalActionPresentation;
  isTriggering?: boolean;
  onTrigger?: () => void;
}) {
  const next = presentation.next;
  const holdDetail =
    next?.holdReason != null
      ? formatFeatureSprintLegalActionFailure(next.reason, next.holdReason)
      : undefined;

  return (
    <View
      style={[
        styles.cardTile,
        {
          marginTop: 12,
          borderColor: presentation.mode === "kernel_managed" ? colors.accentPrimary : colors.borderStrong,
          borderWidth: 1
        }
      ]}
    >
      <View style={[styles.cardActionsRow, { alignItems: "center", justifyContent: "space-between" }]}>
        <Text style={styles.label}>Next legal action</Text>
        <Text
          style={[
            styles.helpText,
            {
              borderColor: colors.borderStrong,
              borderRadius: 999,
              borderWidth: 1,
              color: modeColor(presentation.mode),
              paddingHorizontal: 8,
              paddingVertical: 3
            }
          ]}
        >
          {modeLabel(presentation.mode)}
        </Text>
      </View>

      <Text style={[styles.titleText, { marginTop: 4 }]}>{presentation.label}</Text>
      <Text style={styles.bodyText}>{presentation.detail}</Text>

      {next ? (
        <View style={{ gap: 4, marginTop: 8 }}>
          {next.executionContext?.taskId ? (
            <Text style={styles.helpText}>
              Task: {next.executionContext.taskId}
              {next.executionContext.phase ? ` · ${next.executionContext.phase}` : ""}
            </Text>
          ) : null}
          <Text style={styles.helpText}>
            State revision: {next.stateRevision}
            {typeof next.executionContext?.frozenSpecRevision === "number"
              ? ` · Spec rev ${next.executionContext.frozenSpecRevision}`
              : ""}
          </Text>
          <Text style={styles.helpText}>
            {presentation.requiresExternalWorker
              ? "Requires external worker execution after you trigger. Applied records launch intent, not provider success."
              : presentation.category === "state_only"
                ? "State-only — applies immediately on trigger."
                : presentation.category === "artifact_required"
                  ? presentation.artifactInputHint ?? "Use the dedicated controls below."
                  : "Informational only."}
          </Text>
          {presentation.artifactInputHint ? (
            <Text style={[styles.helpText, { color: colors.accentPrimary }]}>
              {presentation.artifactInputHint}
            </Text>
          ) : null}
          {holdDetail ? (
            <Text style={[styles.helpText, { color: colors.accentPrimary }]}>{holdDetail}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.cardActionsRow, { marginTop: 12, gap: 8 }]}>
        {presentation.canTrigger && onTrigger ? (
          <Pressable
            accessibilityRole="button"
            disabled={isTriggering}
            onPress={onTrigger}
            style={[
              styles.secondaryAction,
              {
                flex: 1,
                borderColor: colors.accentPrimary,
                opacity: isTriggering ? 0.6 : 1
              }
            ]}
          >
            <Text style={[styles.secondaryActionText, { color: colors.accentPrimary }]}>
              {isTriggering ? "Working…" : triggerLabel(presentation)}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {next ? (
        <View style={{ marginTop: 10, gap: 2 }}>
          <Text style={styles.helpText}>Debug</Text>
          <Text style={styles.helpText}>Action: {next.action}</Text>
          <Text style={styles.helpText} selectable>
            Action ID: {next.actionId}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
