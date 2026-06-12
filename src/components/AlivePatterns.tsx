import { type ReactNode } from "react";
import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { styles } from "./styles";

interface MoveAction {
  label: string;
  href?: Href;
  onPress?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "small";
}

interface PrimaryMovePanelProps {
  label: string;
  title: string;
  reason: string;
  primaryAction?: MoveAction;
  secondaryActions?: MoveAction[];
  footnote?: string;
  children?: ReactNode;
}

interface SignalStripProps {
  label: string;
  text: string;
  tone?: "companion" | "warning" | "proof" | "neutral";
  children?: ReactNode;
}

interface ProofNuggetProps {
  title: string;
  meta?: string;
  href?: Href;
  accentColor?: string;
}

interface UsefulEmptyStateProps {
  title: string;
  copy: string;
}

function actionStyle(action: MoveAction) {
  const base =
    action.variant === "small"
      ? styles.smallButton
      : action.variant === "secondary"
        ? styles.secondaryAction
        : styles.primaryAction;

  return StyleSheet.flatten([base, action.disabled ? { opacity: 0.55 } : null]);
}

function actionTextStyle(action: MoveAction) {
  if (action.variant === "small") {
    return styles.smallButtonText;
  }
  if (action.variant === "secondary") {
    return styles.secondaryActionText;
  }
  return styles.primaryActionText;
}

function renderMoveAction(action: MoveAction) {
  const button = (
    <Pressable
      accessibilityRole="button"
      disabled={action.disabled}
      onPress={action.onPress}
      style={actionStyle(action)}
    >
      <Text style={actionTextStyle(action)}>{action.label}</Text>
    </Pressable>
  );

  if (!action.href) {
    return button;
  }

  return (
    <Link href={action.href} asChild>
      {button}
    </Link>
  );
}

export function PrimaryMovePanel({
  label,
  title,
  reason,
  primaryAction,
  secondaryActions = [],
  footnote,
  children
}: PrimaryMovePanelProps) {
  return (
    <View style={styles.primaryMovePanel}>
      <Text style={styles.primaryMoveLabel}>{label}</Text>
      <Text style={styles.primaryMoveTitle}>{title}</Text>
      <Text style={styles.primaryMoveReason}>{reason}</Text>
      {children}
      {primaryAction || secondaryActions.length > 0 ? (
        <View style={styles.primaryMoveActions}>
          {primaryAction ? (
            <View key={primaryAction.label}>{renderMoveAction(primaryAction)}</View>
          ) : null}
          {secondaryActions.map((action) => (
            <View key={action.label}>{renderMoveAction(action)}</View>
          ))}
        </View>
      ) : null}
      {footnote ? <Text style={styles.primaryMoveFootnote}>{footnote}</Text> : null}
    </View>
  );
}

export function SignalStrip({ label, text, tone = "neutral", children }: SignalStripProps) {
  const toneStyle =
    tone === "companion"
      ? styles.signalStripCompanion
      : tone === "warning"
        ? styles.signalStripWarning
        : tone === "proof"
          ? styles.signalStripProof
          : null;

  return (
    <View style={[styles.signalStrip, toneStyle]}>
      <Text style={styles.signalStripLabel}>{label}</Text>
      <Text style={styles.signalStripText}>{text}</Text>
      {children}
    </View>
  );
}

export function ProofNugget({ title, meta, href, accentColor }: ProofNuggetProps) {
  const content = (
    <View style={[styles.proofNugget, accentColor ? { borderLeftColor: accentColor } : null]}>
      <Text style={styles.proofNuggetTitle}>{title}</Text>
      {meta ? <Text style={styles.proofNuggetMeta}>{meta}</Text> : null}
    </View>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link">{content}</Pressable>
    </Link>
  );
}

export function UsefulEmptyState({ title, copy }: UsefulEmptyStateProps) {
  return (
    <View style={styles.usefulEmptyState}>
      <Text style={styles.usefulEmptyTitle}>{title}</Text>
      <Text style={styles.usefulEmptyCopy}>{copy}</Text>
    </View>
  );
}
