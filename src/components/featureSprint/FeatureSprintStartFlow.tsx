import { Pressable, Text, TextInput, View } from "react-native";

import type { FeatureSprintRunnerAgent } from "../../core/featureSprintRunner";
import { runnerAgentLabel } from "../../core/featureSprintRunner";
import type { FeatureSprintRunnerHealthProbe } from "../../core/featureSprintRunnerHealth";
import { formatRunnerHealthCapabilityLine } from "../../core/featureSprintRunnerHealth";
import type { HarnessFeatureSpecSource } from "../../core/types";
import { FeatureSprintRunnerSetupPanel } from "./FeatureSprintRunnerSetupPanel";
import { colors, styles } from "../styles";

export type FeatureSprintStartFlowProps = {
  cardTitle: string;
  nextTinyAction?: string;
  roughSpec: string;
  onChangeRoughSpec: (value: string) => void;
  onClearSpec: () => void;
  onUseNextActionAsSpec?: () => void;

  featureSpecSource: HarnessFeatureSpecSource;
  onSelectFeatureSpecSource: (source: HarnessFeatureSpecSource) => void;
  isFeatureSpecDirty: boolean;
  isFeatureSpecApproved: boolean;
  hasPersistedFeatureSpec: boolean;
  revisedSpecAwaitingApproval?: boolean;
  onSaveFeatureSpec: () => void;
  onApproveFeatureSpec: () => void;

  runnerAgent: FeatureSprintRunnerAgent;
  onSelectRunnerAgent: (agent: FeatureSprintRunnerAgent) => void;
  runnerHealth: "unknown" | "available" | "unavailable";
  runnerHealthProbe?: FeatureSprintRunnerHealthProbe;
  appTokenConfigured: boolean;
  isCheckingRunner: boolean;
  isRunningScoping: boolean;

  hasProjectMetadata: boolean;
  hasRepoPath: boolean;
  hasActivePlan: boolean;
  canCopyScopingPacket: boolean;

  onCheckRunner: () => void;
  onCopyScopingPacket: () => void;
  onRunScoping: () => void;
  onSetupNotice?: (kind: "success" | "warning", message: string) => void;
};

const FEATURE_SPEC_SOURCES: HarnessFeatureSpecSource[] = ["chatgpt_web", "manual", "other"];

function featureSpecSourceLabel(source: HarnessFeatureSpecSource): string {
  if (source === "chatgpt_web") {
    return "ChatGPT web";
  }
  if (source === "manual") {
    return "Manual";
  }
  return "Other";
}

function runnerStatusLabel(
  runnerHealth: FeatureSprintStartFlowProps["runnerHealth"],
  runnerHealthProbe?: FeatureSprintRunnerHealthProbe
): string {
  if (runnerHealth === "available") {
    return runnerHealthProbe
      ? formatRunnerHealthCapabilityLine(runnerHealthProbe)
      : "available";
  }
  if (runnerHealth === "unavailable") {
    return runnerHealthProbe?.error ?? "unavailable";
  }
  return "not checked";
}

function SetupStatusRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
      <Text style={styles.bodyText}>{label}</Text>
      <Text style={styles.helpText}>{ready ? "ready" : "missing"}</Text>
    </View>
  );
}

function RunnerAgentToggle({
  runnerAgent,
  onSelectRunnerAgent
}: {
  runnerAgent: FeatureSprintRunnerAgent;
  onSelectRunnerAgent: (agent: FeatureSprintRunnerAgent) => void;
}) {
  return (
    <View style={[styles.cardActionsRow, { marginTop: 8, flexWrap: "wrap" }]}>
      {(["codex", "cursor"] as const).map((agent) => (
        <Pressable
          key={agent}
          style={[
            styles.secondaryAction,
            runnerAgent === agent && { borderColor: colors.accentPrimary }
          ]}
          onPress={() => onSelectRunnerAgent(agent)}
        >
          <Text style={styles.secondaryActionText}>{runnerAgentLabel(agent)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function FeatureSpecSourceToggle({
  featureSpecSource,
  onSelectFeatureSpecSource
}: {
  featureSpecSource: HarnessFeatureSpecSource;
  onSelectFeatureSpecSource: (source: HarnessFeatureSpecSource) => void;
}) {
  return (
    <View style={[styles.cardActionsRow, { marginTop: 8, flexWrap: "wrap" }]}>
      {FEATURE_SPEC_SOURCES.map((source) => (
        <Pressable
          key={source}
          style={[
            styles.secondaryAction,
            featureSpecSource === source && { borderColor: colors.accentPrimary }
          ]}
          onPress={() => onSelectFeatureSpecSource(source)}
        >
          <Text style={styles.secondaryActionText}>{featureSpecSourceLabel(source)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function FeatureSprintStartFlow({
  cardTitle,
  nextTinyAction,
  roughSpec,
  onChangeRoughSpec,
  onClearSpec,
  onUseNextActionAsSpec,
  featureSpecSource,
  onSelectFeatureSpecSource,
  isFeatureSpecDirty,
  isFeatureSpecApproved,
  hasPersistedFeatureSpec,
  revisedSpecAwaitingApproval = false,
  onSaveFeatureSpec,
  onApproveFeatureSpec,
  runnerAgent,
  onSelectRunnerAgent,
  runnerHealth,
  runnerHealthProbe,
  appTokenConfigured,
  isCheckingRunner,
  isRunningScoping,
  hasProjectMetadata,
  hasRepoPath,
  hasActivePlan,
  canCopyScopingPacket,
  onCheckRunner,
  onCopyScopingPacket,
  onRunScoping,
  onSetupNotice
}: FeatureSprintStartFlowProps) {
  return (
    <View style={[styles.cardTile, { marginTop: 12 }]}>
      <Text style={styles.label}>Start feature</Text>
      <Text style={[styles.helpText, { marginTop: 4 }]}>
        Guided path for {cardTitle}. Paste a ChatGPT web spec, save and approve it, then scope or
        import a plan.
      </Text>

      {hasActivePlan ? (
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          Feature plan already started. Continue below with the current step.
        </Text>
      ) : null}

      <View style={{ marginTop: 12, gap: 4 }}>
        <Text style={styles.label}>1. Describe the feature</Text>
        <Text style={styles.helpText}>
          Paste the feature spec from ChatGPT web or another architect session. Save it to the plan
          before approving.
        </Text>
        <Text style={styles.helpText}>Spec source:</Text>
        <FeatureSpecSourceToggle
          featureSpecSource={featureSpecSource}
          onSelectFeatureSpecSource={onSelectFeatureSpecSource}
        />
        <TextInput
          style={[styles.captureInput, { minHeight: 88, marginTop: 8, textAlignVertical: "top" }]}
          value={roughSpec}
          onChangeText={onChangeRoughSpec}
          placeholder="Paste your ChatGPT web feature spec here."
          placeholderTextColor={colors.inputPlaceholder}
          multiline
        />
        {isFeatureSpecDirty ? (
          <Text style={[styles.helpText, { marginTop: 4, color: colors.accentPrimary }]}>
            Unsaved changes — save the spec before approving.
          </Text>
        ) : null}
        {hasPersistedFeatureSpec && isFeatureSpecApproved ? (
          <Text style={[styles.helpText, { marginTop: 4, color: colors.accentSuccess }]}>
            Spec approved and ready for implementation gating.
          </Text>
        ) : hasPersistedFeatureSpec && revisedSpecAwaitingApproval ? (
          <Text style={[styles.helpText, { marginTop: 4, color: colors.accentPrimary }]}>
            Revised spec imported. Approve it before advancing or running implementation.
          </Text>
        ) : hasPersistedFeatureSpec ? (
          <Text style={[styles.helpText, { marginTop: 4 }]}>
            Spec saved. Approve it before running implementation.
          </Text>
        ) : null}
        <View style={[styles.cardActionsRow, { marginTop: 8, flexWrap: "wrap" }]}>
          <Pressable
            style={[
              styles.secondaryAction,
              isFeatureSpecDirty && { borderColor: colors.accentPrimary }
            ]}
            onPress={onSaveFeatureSpec}
          >
            <Text style={styles.secondaryActionText}>Save feature spec</Text>
          </Pressable>
          <Pressable
            testID="feature-sprint-approve-feature-spec"
            style={[
              styles.secondaryAction,
              (!hasPersistedFeatureSpec || isFeatureSpecDirty || isFeatureSpecApproved) && {
                opacity: 0.5
              }
            ]}
            disabled={!hasPersistedFeatureSpec || isFeatureSpecDirty || isFeatureSpecApproved}
            onPress={onApproveFeatureSpec}
          >
            <Text style={styles.secondaryActionText}>Approve feature spec</Text>
          </Pressable>
          <Pressable style={styles.secondaryAction} onPress={onClearSpec}>
            <Text style={styles.secondaryActionText}>Clear spec</Text>
          </Pressable>
          {nextTinyAction?.trim() && onUseNextActionAsSpec ? (
            <Pressable style={styles.secondaryAction} onPress={onUseNextActionAsSpec}>
              <Text style={styles.secondaryActionText}>Use card next action as spec</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: 16, gap: 4 }}>
        <Text style={styles.label}>2. Check setup</Text>
        <SetupStatusRow label="Project metadata" ready={hasProjectMetadata} />
        <SetupStatusRow label="Repo path" ready={hasRepoPath} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
          <Text style={styles.bodyText}>Runner</Text>
          <Text style={styles.helpText}>{runnerStatusLabel(runnerHealth, runnerHealthProbe)}</Text>
        </View>
        <Text style={[styles.helpText, { marginTop: 6 }]}>
          Missing project metadata does not block scoping, but repo path is needed later for
          implementation runs. Manual copy/paste still works if the runner is unavailable.
        </Text>
        <View style={[styles.cardActionsRow, { marginTop: 8 }]}>
          <Pressable
            style={[styles.secondaryAction, isCheckingRunner && { opacity: 0.5 }]}
            disabled={isCheckingRunner}
            onPress={onCheckRunner}
          >
            <Text style={styles.secondaryActionText}>
              {isCheckingRunner ? "Checking…" : "Check runner"}
            </Text>
          </Pressable>
        </View>

        <FeatureSprintRunnerSetupPanel
          runnerAgent={runnerAgent}
          runnerHealth={runnerHealth}
          runnerHealthProbe={runnerHealthProbe}
          appTokenConfigured={appTokenConfigured}
          onNotice={onSetupNotice}
        />
      </View>

      <View style={{ marginTop: 16, gap: 4 }}>
        <Text style={styles.label}>3. Scope it</Text>
        <Text style={styles.helpText}>Runner agent for scoping, review, and implementation:</Text>
        <RunnerAgentToggle runnerAgent={runnerAgent} onSelectRunnerAgent={onSelectRunnerAgent} />
        <View style={[styles.cardActionsRow, { marginTop: 8, flexWrap: "wrap" }]}>
          {canCopyScopingPacket ? (
            <Pressable style={styles.secondaryAction} onPress={onCopyScopingPacket}>
              <Text style={styles.secondaryActionText}>Copy for ChatGPT/Codex scoping</Text>
            </Pressable>
          ) : (
            <Text style={styles.helpText}>Clipboard copy unavailable in this environment.</Text>
          )}
          <Pressable
            style={[styles.secondaryAction, isRunningScoping && { opacity: 0.5 }]}
            disabled={isRunningScoping}
            onPress={onRunScoping}
          >
            <Text style={styles.secondaryActionText}>
              {isRunningScoping ? "Running…" : `Run scoping with ${runnerAgentLabel(runnerAgent)}`}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.helpText, { marginTop: 6 }]}>
          Output will fill the Import plan box below. Import is still manual.
        </Text>
      </View>
    </View>
  );
}
