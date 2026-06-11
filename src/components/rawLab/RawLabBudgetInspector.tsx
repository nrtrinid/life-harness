import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";
import type { CompanionSelfMemory } from "../../core/companionSelfMemory";
import { DEFAULT_GATEWAY_MAX_INPUT_CHARS } from "../../core/gatewayBudget";
import {
  buildRawLabSendBundle,
  type RawLabBudgetLevel,
  type RawLabCompactionNotice
} from "../../core/rawLabContextBudget";
import type {
  RawLabSmartCompactedContext,
  RawLabThreadState,
  RawLabTurn
} from "../../core/rawLabThreadState";

type RawLabBudgetInspectorProps = {
  turns: RawLabTurn[];
  threadState: RawLabThreadState;
  message: string;
  gatewayRawLabMaxInputChars: number;
  gatewayMaxInputChars?: number;
  companionSelfMemories?: CompanionSelfMemory[];
  forceExpanded?: boolean;
  embeddedInBackroom?: boolean;
  lastSend?: {
    estimatedChars: number;
    level: RawLabBudgetLevel;
    turnsSent: number;
    memoriesSent: number;
    budgetCapChars: number;
    notice?: RawLabCompactionNotice;
    smartCompactedContext?: RawLabSmartCompactedContext;
  };
  onDismissCompactedContext?: () => void;
};

export function RawLabBudgetInspector({
  turns,
  threadState,
  message,
  gatewayRawLabMaxInputChars,
  gatewayMaxInputChars = DEFAULT_GATEWAY_MAX_INPUT_CHARS,
  companionSelfMemories = [],
  forceExpanded = false,
  embeddedInBackroom = false,
  lastSend,
  onDismissCompactedContext
}: RawLabBudgetInspectorProps) {
  const [expanded, setExpanded] = useState(embeddedInBackroom);
  const [preview, setPreview] = useState<{
    estimatedChars: number;
    level: RawLabBudgetLevel;
    turnsSent: number;
    memoriesSent: number;
    budgetCapChars: number;
    smartCompactedContext: RawLabSmartCompactedContext;
  } | null>(null);

  useEffect(() => {
    if (forceExpanded) {
      setExpanded(true);
    }
  }, [forceExpanded]);

  function handlePreviewCompact() {
    const bundle = buildRawLabSendBundle({
      message: message.trim() || "preview",
      turns,
      threadState,
      companionSelfMemories,
      maxInputChars: gatewayRawLabMaxInputChars
    });
    setPreview({
      estimatedChars: bundle.estimatedChars,
      level: bundle.level,
      turnsSent: bundle.recentTurns.length,
      memoriesSent: bundle.companionSelfMemories.length,
      budgetCapChars: gatewayRawLabMaxInputChars,
      smartCompactedContext: bundle.smartCompactedContext
    });
  }

  function hasSmartCompactedContext(context?: RawLabSmartCompactedContext): boolean {
    if (!context) {
      return false;
    }
    return (
      context.activeOpenLoops.length > 0 ||
      context.questionsToRevisit.length > 0 ||
      context.userSteering.length > 0 ||
      context.doNotRepeat.length > 0 ||
      context.recurringTopics.length > 0 ||
      context.provisionalStances.length > 0 ||
      context.selfObservations.length > 0 ||
      context.importantRecentMoments.length > 0 ||
      Boolean(context.currentTension) ||
      Boolean(context.discardedNoiseSummary)
    );
  }

  function renderContextList(label: string, items: string[]) {
    if (items.length === 0) {
      return null;
    }
    return (
      <>
        <Text style={styles.chatInspectorHeader}>{label}</Text>
        {items.map((item, index) => (
          <Text key={`${label}-${index}`} style={styles.helpText}>
            - {item}
          </Text>
        ))}
      </>
    );
  }

  function renderSmartCompactedContext(
    context: RawLabSmartCompactedContext | undefined,
    label: string,
    dismissible: boolean
  ) {
    if (!hasSmartCompactedContext(context)) {
      return null;
    }
    return (
      <View style={styles.chatBackroomSection}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <Text style={styles.helpText}>
          Temporary working memory for this send. Not saved to Life Harness, not board context,
          not Memory Bank.
        </Text>
        {renderContextList("Do not repeat", context?.doNotRepeat ?? [])}
        {renderContextList("User steering", context?.userSteering ?? [])}
        {renderContextList("Open loops", context?.activeOpenLoops ?? [])}
        {renderContextList("Questions to revisit", context?.questionsToRevisit ?? [])}
        {context?.currentTension ? (
          <>
            <Text style={styles.chatInspectorHeader}>Current tension</Text>
            <Text style={styles.helpText}>{context.currentTension}</Text>
          </>
        ) : null}
        {renderContextList("Important recent moments", context?.importantRecentMoments ?? [])}
        {renderContextList("Provisional stances", context?.provisionalStances ?? [])}
        {renderContextList("Self-observations", context?.selfObservations ?? [])}
        {renderContextList("Recurring topics", context?.recurringTopics ?? [])}
        {context?.discardedNoiseSummary ? (
          <>
            <Text style={styles.chatInspectorHeader}>Discarded noise</Text>
            <Text style={styles.helpText}>{context.discardedNoiseSummary}</Text>
          </>
        ) : null}
        <Text style={styles.helpText}>
          Confidence {Math.round((context?.confidence ?? 0) * 100)}%
          {(context?.sourceTurnIds.length ?? 0) > 0
            ? ` · source turns ${context?.sourceTurnIds.join(", ")}`
            : ""}
        </Text>
        {dismissible && onDismissCompactedContext ? (
          <Pressable onPress={onDismissCompactedContext} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>Dismiss compacted working memory</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  function capLabel(cap: number): string {
    const isRawLabCap = cap === gatewayRawLabMaxInputChars;
    const isHarnessDefault = cap === gatewayMaxInputChars;
    if (isRawLabCap) {
      return `${cap.toLocaleString()} (Raw Signal-specific)`;
    }
    if (isHarnessDefault) {
      return `${cap.toLocaleString()} (Companion default)`;
    }
    return `${cap.toLocaleString()} (custom)`;
  }

  if (!expanded) {
    return (
      <Pressable onPress={() => setExpanded(true)} style={styles.smallButton}>
        <Text style={styles.smallButtonText}>
          {embeddedInBackroom ? "Show budget details" : `Thread budget${lastSend?.notice ? " ⚠" : ""}`}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.chatBackroomSection}>
      <Pressable onPress={() => !embeddedInBackroom && setExpanded(false)}>
        <Text style={styles.sectionTitle}>Thread budget</Text>
      </Pressable>
      <Text style={styles.helpText}>
        {lastSend?.notice ? "Compact older thread memory when needed." : "Budget OK for now."}
      </Text>
      <Text style={styles.helpText}>
        Raw Signal max ~{gatewayRawLabMaxInputChars.toLocaleString()} chars (Companion default{" "}
        {gatewayMaxInputChars.toLocaleString()}).
      </Text>
      {lastSend ? (
        <>
          <Text style={styles.bodyText}>
            Last send: ~{lastSend.estimatedChars.toLocaleString()} chars, {lastSend.turnsSent} turns,{" "}
            {lastSend.memoriesSent} self-memories, level {lastSend.level}.
          </Text>
          <Text style={styles.helpText}>
            Budget cap used: {capLabel(lastSend.budgetCapChars)}
            {lastSend.budgetCapChars === gatewayRawLabMaxInputChars &&
            gatewayRawLabMaxInputChars !== gatewayMaxInputChars
              ? ` — not the Companion ${gatewayMaxInputChars.toLocaleString()} default.`
              : ""}
          </Text>
          {lastSend.notice ? (
            <Text style={styles.bannerWarningText}>{lastSend.notice.message}</Text>
          ) : null}
          {renderSmartCompactedContext(
            lastSend.smartCompactedContext,
            "Smart compacted working memory",
            true
          )}
        </>
      ) : (
        <Text style={styles.helpText}>No sends yet this session.</Text>
      )}
      {preview ? (
        <>
          <Text style={styles.bodyText}>
            Preview compact: ~{preview.estimatedChars.toLocaleString()} chars, {preview.turnsSent}{" "}
            turns, {preview.memoriesSent} self-memories, level {preview.level}.
          </Text>
          <Text style={styles.helpText}>Preview cap: {capLabel(preview.budgetCapChars)}</Text>
          {renderSmartCompactedContext(
            preview.smartCompactedContext,
            "Preview compacted working memory",
            false
          )}
        </>
      ) : null}
      <Pressable onPress={handlePreviewCompact} style={styles.smallButton}>
        <Text style={styles.smallButtonText}>Compact older thread memory now (preview)</Text>
      </Pressable>
    </View>
  );
}
