import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import {
  FEATURE_SPRINT_RUNNER_DIFF_FALLBACK_MESSAGE,
  FEATURE_SPRINT_RUNNER_DIFF_TRUNCATION_NOTICE,
  FEATURE_SPRINT_RUNNER_OUTPUT_TRUNCATION_NOTICE,
  FEATURE_SPRINT_WORKTREE_CLEANUP_HELPER,
  FEATURE_SPRINT_WORKTREE_FORCE_CLEAN_HELPER,
  type FeatureSprintRunnerOutputView
} from "../../core/featureSprintRunnerOutputView";
import { colors, styles } from "../styles";

type FeatureRunnerOutputDetailsProps = {
  view: FeatureSprintRunnerOutputView;
  profileLabel: string;
  formattedStartedAt: string;
  canCopy: boolean;
  onCopyOutput: () => void;
  onCopyDiff?: () => void;
  onCopyVerificationSummary?: () => void;
  onCopyWorktreePath?: () => void;
  onCleanWorktree?: () => void;
  onForceCleanWorktree?: () => void;
  showForceClean?: boolean;
  isCleaning?: boolean;
};

function cleanupStatusLabel(view: FeatureSprintRunnerOutputView): string | undefined {
  if (view.worktreeCleanedAt || view.worktreeCleanupStatus === "cleaned") {
    return "Worktree cleaned";
  }
  if (view.worktreeCleanupStatus === "blocked") {
    return "Cleanup blocked: uncommitted changes";
  }
  if (view.worktreeCleanupStatus === "failed") {
    return "Cleanup failed";
  }
  if (view.worktreeCleanupStatus === "not_found") {
    return "Worktree not found on disk";
  }
  return undefined;
}

const monoBlockStyle = {
  fontFamily: "monospace" as const,
  fontSize: 12,
  lineHeight: 18
};

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export function FeatureRunnerOutputDetails({
  view,
  profileLabel,
  formattedStartedAt,
  canCopy,
  onCopyOutput,
  onCopyDiff,
  onCopyVerificationSummary,
  onCopyWorktreePath,
  onCleanWorktree,
  onForceCleanWorktree,
  showForceClean = false,
  isCleaning = false
}: FeatureRunnerOutputDetailsProps) {
  const outputBody = view.outputText ?? view.outputExcerpt;
  const cleanupLabel = cleanupStatusLabel(view);

  return (
    <View style={[styles.cardTile, { marginTop: 8, gap: 4 }]}>
      <DetailBlock label="Runner output">
        <Text style={styles.bodyText}>
          {profileLabel} · {view.status} · {formattedStartedAt}
          {view.importedAt ? " · Imported" : ""}
          {view.usabilityLabel ? ` · ${view.usabilityLabel}` : ""}
        </Text>
        {view.taskId ? (
          <Text style={styles.helpText}>
            Map: {view.sprintId}/{view.storyId}/{view.taskId}
            {view.mapPhase ? ` · ${view.mapPhase}` : ""}
          </Text>
        ) : null}
        {view.diagnosticMessage ? (
          <Text style={styles.helpText}>{view.diagnosticMessage}</Text>
        ) : null}
        {view.worktreePath ? <Text style={styles.helpText}>Worktree: {view.worktreePath}</Text> : null}
        {view.branchName ? <Text style={styles.helpText}>Branch: {view.branchName}</Text> : null}
      </DetailBlock>

      {outputBody ? (
        <DetailBlock label="Implementation output">
          {view.outputTruncated ? (
            <Text style={[styles.helpText, { color: colors.accentPrimary }]}>
              {FEATURE_SPRINT_RUNNER_OUTPUT_TRUNCATION_NOTICE}
            </Text>
          ) : null}
          <Text style={[styles.helpText, monoBlockStyle]}>{outputBody}</Text>
          {canCopy ? (
            <Pressable style={[styles.secondaryAction, { marginTop: 8, alignSelf: "flex-start" }]} onPress={onCopyOutput}>
              <Text style={styles.secondaryActionText}>Copy output</Text>
            </Pressable>
          ) : null}
        </DetailBlock>
      ) : null}

      {view.changedFiles.length > 0 ? (
        <DetailBlock label="Changed files">
          {view.changedFiles.map((file) => (
            <Text key={file} style={styles.helpText}>
              ▸ {file}
            </Text>
          ))}
        </DetailBlock>
      ) : null}

      {view.diffStat ? (
        <DetailBlock label="Diff stat">
          <Text style={[styles.helpText, monoBlockStyle]}>{view.diffStat}</Text>
        </DetailBlock>
      ) : null}

      <DetailBlock label="Diff">
        {view.diffText ? (
          <>
            {view.diffTruncated ? (
              <Text style={[styles.helpText, { color: colors.accentPrimary }]}>
                {FEATURE_SPRINT_RUNNER_DIFF_TRUNCATION_NOTICE}
              </Text>
            ) : null}
            <Text style={[styles.helpText, monoBlockStyle]}>{view.diffText}</Text>
            {canCopy && onCopyDiff ? (
              <Pressable style={[styles.secondaryAction, { marginTop: 8, alignSelf: "flex-start" }]} onPress={onCopyDiff}>
                <Text style={styles.secondaryActionText}>Copy diff</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Text style={styles.helpText}>
            {view.showDiffFallback
              ? FEATURE_SPRINT_RUNNER_DIFF_FALLBACK_MESSAGE
              : "No diff captured for this run."}
          </Text>
        )}
      </DetailBlock>

      {view.profile === "codex_implementation" ? (
        <DetailBlock label="Verification">
          <Text style={styles.bodyText}>Summary: {view.verificationSummary}</Text>
          {view.verificationResults.map((row) => (
            <Text key={`${row.command}-${row.status}`} style={styles.helpText}>
              {row.status === "failed" ? "!" : row.status === "passed" ? "OK" : "-"} {row.command} ({row.status})
            </Text>
          ))}
          {view.verificationFailures.map((failure) => (
            <View key={`fail-${failure.command}`} style={{ marginTop: 4 }}>
              {failure.error ? <Text style={styles.helpText}>{failure.error}</Text> : null}
              {failure.stderrExcerpt ? (
                <Text style={[styles.helpText, monoBlockStyle]}>{failure.stderrExcerpt}</Text>
              ) : null}
              {!failure.stderrExcerpt && failure.stdoutExcerpt ? (
                <Text style={[styles.helpText, monoBlockStyle]}>{failure.stdoutExcerpt}</Text>
              ) : null}
            </View>
          ))}
          {canCopy && onCopyVerificationSummary ? (
            <Pressable
              style={[styles.secondaryAction, { marginTop: 8, alignSelf: "flex-start" }]}
              onPress={onCopyVerificationSummary}
            >
              <Text style={styles.secondaryActionText}>Copy verification summary</Text>
            </Pressable>
          ) : null}
        </DetailBlock>
      ) : null}

      {view.profile === "codex_implementation" && view.worktreePath ? (
        <DetailBlock label="Worktree cleanup">
          {view.canCleanWorktree ? (
            <Text style={styles.helpText}>{FEATURE_SPRINT_WORKTREE_CLEANUP_HELPER}</Text>
          ) : null}
          {cleanupLabel ? <Text style={styles.bodyText}>{cleanupLabel}</Text> : null}
          {view.worktreeCleanupMessage ? (
            <Text style={styles.helpText}>{view.worktreeCleanupMessage}</Text>
          ) : null}
          {view.worktreeCleanupStatus === "blocked" && view.canCleanWorktree ? (
            <Text style={[styles.helpText, { marginTop: 4 }]}>
              Safety check passed: uncommitted changes detected. Use Force clean after inspection.
            </Text>
          ) : null}
          <View style={[styles.cardActionsRow, { marginTop: 8, flexWrap: "wrap" }]}>
            {canCopy && onCopyWorktreePath ? (
              <Pressable style={styles.secondaryAction} onPress={onCopyWorktreePath}>
                <Text style={styles.secondaryActionText}>Copy path</Text>
              </Pressable>
            ) : null}
            {view.canCleanWorktree && onCleanWorktree ? (
              <Pressable
                style={[styles.secondaryAction, isCleaning && { opacity: 0.5 }]}
                disabled={isCleaning}
                onPress={onCleanWorktree}
              >
                <Text style={styles.secondaryActionText}>
                  {isCleaning ? "Cleaning…" : "Clean worktree"}
                </Text>
              </Pressable>
            ) : null}
            {showForceClean && onForceCleanWorktree ? (
              <Pressable
                style={[styles.secondaryAction, isCleaning && { opacity: 0.5 }]}
                disabled={isCleaning}
                onPress={onForceCleanWorktree}
              >
                <Text style={styles.secondaryActionText}>
                  {isCleaning ? "Cleaning…" : "Force clean worktree"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {showForceClean ? (
            <Text style={[styles.helpText, { marginTop: 6 }]}>{FEATURE_SPRINT_WORKTREE_FORCE_CLEAN_HELPER}</Text>
          ) : null}
        </DetailBlock>
      ) : null}

      <DetailBlock label="Safety">
        {view.safetyNotes.map((note) => (
          <Text key={note} style={styles.helpText}>
            ▸ {note}
          </Text>
        ))}
      </DetailBlock>
    </View>
  );
}
