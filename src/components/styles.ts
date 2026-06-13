import { StyleSheet } from "react-native";

import type { LifeArea } from "../core/types";

// Lo-Fi Companion OS — semantic palette (charcoal base, warm text)
const lofiColors = {
  background: "#121214",
  sidebar: "#18181B",
  surface: "#1E1E22",
  surfaceQuiet: "#1A1A1D",
  surfaceRaised: "#242428",
  textPrimary: "#EDE8DF",
  textSecondary: "rgba(237,232,223,0.82)",
  textMuted: "rgba(237,232,223,0.48)",
  border: "rgba(237,232,223,0.08)",
  borderStrong: "rgba(237,232,223,0.16)",
  actionAmber: "#C8A84B",
  warningAmber: "#B8923A",
  softViolet: "#9B8BB8",
  dustyBlue: "#6B8FA3",
  mossGreen: "#7A9B6E",
  fadedRose: "#B87A7A",
  cassetteAmber: "#C8A84B",
  cardSurface: "rgba(30, 30, 34, 0.92)",
  cardBorder: "rgba(237, 232, 223, 0.08)"
};

// Legacy colors object — aliases to lofiColors for StyleSheet compatibility
const colors = {
  bgPrimary: lofiColors.background,
  bgSecondary: lofiColors.surfaceQuiet,
  bgTertiary: lofiColors.surfaceRaised,
  bgCard: lofiColors.surface,
  borderSubtle: lofiColors.border,
  borderDefault: "rgba(237,232,223,0.12)",
  borderStrong: lofiColors.borderStrong,
  borderAccent: lofiColors.actionAmber,
  textPrimary: lofiColors.textPrimary,
  textSecondary: lofiColors.textSecondary,
  textTertiary: "rgba(237,232,223,0.58)",
  textMuted: lofiColors.textMuted,
  textLabel: lofiColors.textMuted,
  accentPrimary: lofiColors.actionAmber,
  accentDanger: "#DC5032",
  accentSuccess: lofiColors.mossGreen,
  accentWarm: "rgba(200,168,75,0.25)",
  statusHot: lofiColors.actionAmber,
  statusWarm: "#9B8755",
  statusCool: "#6E6E78",
  statusCold: "#52525A",
  inputBg: lofiColors.background,
  inputBorder: lofiColors.border,
  inputText: lofiColors.textPrimary,
  inputPlaceholder: "rgba(237,232,223,0.35)"
};

// Typography scale
const typography = {
  // Use system fonts that approximate Field Ops aesthetic
  fontPrimary: "System",
  fontDisplay: "System",
  
  // Sizes
  displayLarge: 38,
  displayMedium: 28,
  headingLarge: 22,
  headingMedium: 18,
  headingSmall: 16,
  bodyLarge: 15,
  bodyMedium: 14,
  bodySmall: 13,
  labelLarge: 13,
  labelMedium: 12,
  labelSmall: 11
};

// Spacing scale
const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24
};

const lofiTypography = {
  fontLofiMono: "monospace" as const,
  tapeLabelSize: typography.labelMedium
};

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPrimary
  },
  screenContent: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: 32
  },
  screenIntro: {
    color: colors.textTertiary,
    fontSize: typography.bodyLarge,
    lineHeight: 24,
    marginBottom: spacing.sm
  },
  navShell: {
    gap: spacing.md
  },
  navPrimaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  navSecondaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  navGroupLabel: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginBottom: spacing.xs
  },
  navPrimaryButton: {
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    borderRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  navPrimaryButtonActive: {
    borderBottomColor: lofiColors.actionAmber,
    borderBottomWidth: 2,
    borderRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  navPrimaryButtonText: {
    color: colors.textMuted,
    fontSize: typography.bodyMedium,
    fontWeight: "600"
  },
  navPrimaryButtonTextActive: {
    color: colors.textPrimary,
    fontSize: typography.bodyMedium,
    fontWeight: "700"
  },
  navSecondaryButton: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  navSecondaryButtonActive: {
    backgroundColor: colors.bgTertiary,
    borderColor: colors.borderSubtle,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  navSecondaryButtonText: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "600"
  },
  navSecondaryButtonTextActive: {
    color: colors.textSecondary,
    fontSize: typography.labelSmall,
    fontWeight: "700"
  },
  appShellWide: {
    backgroundColor: colors.bgPrimary,
    flex: 1,
    flexDirection: "row",
    minHeight: 0
  },
  appShellNarrow: {
    backgroundColor: colors.bgPrimary,
    flex: 1,
    minHeight: 0
  },
  appShellContent: {
    flex: 1,
    minHeight: 0
  },
  sidebar: {
    backgroundColor: lofiColors.sidebar,
    borderRightColor: colors.borderSubtle,
    borderRightWidth: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    width: 220
  },
  sidebarBrand: {
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  sidebarBrandTitle: {
    color: colors.textPrimary,
    fontSize: typography.headingSmall,
    fontWeight: "700"
  },
  sidebarBrandSubtitle: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontStyle: "italic"
  },
  sidebarNavStack: {
    gap: spacing.xs
  },
  sidebarNavLink: {
    borderLeftColor: "transparent",
    borderLeftWidth: 3,
    borderRadius: 4,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  sidebarNavLinkActive: {
    backgroundColor: lofiColors.surfaceRaised,
    borderLeftColor: lofiColors.actionAmber,
    borderLeftWidth: 3,
    borderRadius: 4,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  sidebarNavLinkText: {
    color: colors.textMuted,
    fontSize: typography.bodyMedium,
    fontWeight: "600"
  },
  sidebarNavLinkTextActive: {
    color: colors.textPrimary,
    fontSize: typography.bodyMedium,
    fontWeight: "700"
  },
  sidebarGroupToggle: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm
  },
  sidebarGroupLabel: {
    color: colors.textMuted,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  navCompactBackroomToggle: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  navCompactBackroomToggleText: {
    color: colors.textMuted,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelMedium,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  navTopChrome: {
    backgroundColor: lofiColors.sidebar,
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  lofiCard: {
    backgroundColor: lofiColors.cardSurface,
    borderColor: lofiColors.cardBorder,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  lofiCardQuiet: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  lofiCompanionNoteCard: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderLeftColor: lofiColors.softViolet,
    borderLeftWidth: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  lofiBonusTrackCard: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderLeftColor: lofiColors.dustyBlue,
    borderLeftWidth: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  lofiCardHero: {
    backgroundColor: lofiColors.surfaceRaised,
    borderColor: colors.borderDefault,
    borderLeftColor: lofiColors.actionAmber,
    borderLeftWidth: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  lofiTapeLabel: {
    color: colors.textMuted,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: lofiTypography.tapeLabelSize,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  lofiCompanionNote: {
    color: colors.textSecondary,
    fontSize: typography.bodyLarge,
    fontStyle: "italic",
    lineHeight: 24
  },
  lofiRescueRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  pageHeader: {
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  pageHeaderTitle: {
    color: colors.textPrimary,
    fontSize: typography.headingLarge,
    fontWeight: "700",
    letterSpacing: 0.2
  },
  pageHeaderSubtitle: {
    color: colors.textTertiary,
    fontSize: typography.bodyMedium,
    lineHeight: 22
  },
  pageHeaderChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs
  },
  section: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderSubtle,
    borderRadius: 3,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: typography.labelMedium,
    fontWeight: "700",
    letterSpacing: 0.3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: 6,
    marginBottom: spacing.xs
  },
  collapsibleHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  collapsibleChevron: {
    color: colors.textMuted,
    fontSize: typography.bodyMedium,
    marginLeft: spacing.sm
  },
  titleText: {
    color: colors.textPrimary,
    fontSize: typography.headingSmall,
    fontWeight: "700",
    lineHeight: 22
  },
  bodyText: {
    color: colors.textSecondary,
    fontSize: typography.bodyMedium,
    lineHeight: 21
  },
  helpText: {
    color: colors.textMuted,
    fontSize: typography.bodySmall,
    lineHeight: 19
  },
  warningText: {
    color: colors.accentDanger,
    fontSize: typography.bodyMedium,
    fontWeight: "700",
    lineHeight: 20
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.labelMedium,
    fontWeight: "600",
    letterSpacing: 0.2,
    marginBottom: spacing.xs
  },
  listItem: {
    color: colors.textSecondary,
    fontSize: typography.bodyMedium,
    lineHeight: 22,
    paddingVertical: 2
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  primaryAction: {
    backgroundColor: colors.accentPrimary,
    borderRadius: 3,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 0
  },
  primaryActionText: {
    color: colors.bgPrimary,
    fontSize: typography.labelLarge,
    fontWeight: "700",
    letterSpacing: 0.2
  },
  primaryMoveLabel: {
    color: lofiColors.actionAmber,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  primaryMoveActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  primaryMovePanel: {
    backgroundColor: colors.bgTertiary,
    borderColor: colors.borderAccent,
    borderLeftColor: colors.borderAccent,
    borderLeftWidth: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  primaryMoveTitle: {
    color: colors.textPrimary,
    fontSize: typography.headingLarge,
    fontWeight: "700",
    lineHeight: 28
  },
  primaryMoveReason: {
    color: colors.textSecondary,
    fontSize: typography.bodyLarge,
    lineHeight: 24
  },
  primaryMoveFootnote: {
    color: colors.textMuted,
    fontSize: typography.bodySmall,
    lineHeight: 18
  },
  proofNugget: {
    backgroundColor: colors.bgTertiary,
    borderColor: colors.borderSubtle,
    borderLeftColor: lofiColors.fadedRose,
    borderLeftWidth: 3,
    borderRadius: 4,
    borderWidth: 1,
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  proofNuggetTitle: {
    color: colors.textPrimary,
    fontSize: typography.bodyMedium,
    fontWeight: "700",
    lineHeight: 20
  },
  proofNuggetMeta: {
    color: colors.textTertiary,
    fontSize: typography.bodySmall,
    lineHeight: 18
  },
  usefulEmptyState: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderSubtle,
    borderRadius: 4,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  usefulEmptyTitle: {
    color: colors.textSecondary,
    fontSize: typography.bodyMedium,
    fontWeight: "700"
  },
  usefulEmptyCopy: {
    color: colors.textMuted,
    fontSize: typography.bodySmall,
    lineHeight: 18
  },
  todayActStack: {
    gap: spacing.lg
  },
  todayBriefingStrip: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderLeftColor: lofiColors.softViolet,
    borderLeftWidth: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  todayBriefingLabel: {
    color: colors.textMuted,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  todayBriefingList: {
    gap: spacing.xs
  },
  todayBriefingItem: {
    color: colors.textSecondary,
    fontSize: typography.bodyMedium,
    lineHeight: 20
  },
  todayBriefingCompanion: {
    color: colors.textSecondary,
    fontSize: typography.bodyMedium,
    fontStyle: "italic",
    lineHeight: 21
  },
  nextMovePanel: {
    backgroundColor: lofiColors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg
  },
  nextMovePanelAct: {
    backgroundColor: lofiColors.surfaceRaised,
    borderColor: "rgba(200,168,75,0.35)",
    borderLeftColor: lofiColors.actionAmber,
    borderLeftWidth: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl
  },
  nextMoveActTitle: {
    color: colors.textPrimary,
    fontSize: typography.displayMedium,
    fontWeight: "700",
    lineHeight: 34
  },
  nextMoveActWhy: {
    color: colors.textSecondary,
    fontSize: typography.bodyMedium,
    lineHeight: 21
  },
  todayRecoveryFallback: {
    gap: spacing.sm
  },
  todayRecoveryLabel: {
    color: colors.textMuted,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  nextMoveActDoBlock: {
    gap: spacing.xs,
    marginTop: spacing.xs
  },
  nextMoveActDoLabel: {
    color: lofiColors.actionAmber,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  nextMoveActDo: {
    color: colors.textPrimary,
    fontSize: typography.headingSmall,
    fontWeight: "600",
    lineHeight: 22
  },
  nextMoveActMeta: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.md
  },
  nextMoveFieldRow: {
    gap: spacing.xs
  },
  nextMoveFieldLabel: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  nextMoveFieldValue: {
    color: colors.textSecondary,
    fontSize: typography.bodyMedium,
    lineHeight: 20
  },
  nextMoveFieldLabelCompact: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  nextMoveFieldValueCompact: {
    color: colors.textTertiary,
    fontSize: typography.bodySmall,
    lineHeight: 18
  },
  nextMoveBackup: {
    color: colors.textMuted,
    fontSize: typography.bodySmall,
    lineHeight: 18,
    marginTop: spacing.xs
  },
  secondaryAction: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontSize: typography.labelLarge,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  captureWrap: {
    gap: spacing.sm
  },
  captureInput: {
    backgroundColor: colors.inputBg,
    borderColor: colors.inputBorder,
    borderRadius: 3,
    borderWidth: 1,
    color: colors.inputText,
    fontSize: typography.bodyLarge,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  actionPanel: {
    gap: spacing.sm
  },
  checklist: {
    gap: spacing.xs
  },
  checklistItem: {
    paddingVertical: 3
  },
  cardActions: {
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  cardActionsCompact: {
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  boardRow: {
    gap: spacing.md,
    paddingVertical: spacing.xs
  },
  boardColumn: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderSubtle,
    borderRadius: 3,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
    width: 300
  },
  columnTitle: {
    color: colors.textSecondary,
    fontSize: typography.labelLarge,
    fontWeight: "700",
    letterSpacing: 0.3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs
  },
  boardSlotStrip: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderSubtle,
    borderRadius: 3,
    borderWidth: 1,
    gap: spacing.xs,
    marginBottom: spacing.md,
    padding: spacing.md
  },
  boardSlotStripTitle: {
    color: colors.textSecondary,
    fontSize: typography.labelLarge,
    fontWeight: "700"
  },
  demoTriageBanner: {
    backgroundColor: colors.bgSecondary,
    borderColor: lofiColors.warningAmber,
    borderRadius: 3,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md
  },
  demoTriageTitle: {
    color: colors.textPrimary,
    fontSize: typography.labelLarge,
    fontWeight: "700"
  },
  activeLimitTriagePanel: {
    backgroundColor: colors.bgSecondary,
    borderColor: lofiColors.warningAmber,
    borderRadius: 3,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md
  },
  activeLimitTriageRow: {
    gap: spacing.xs
  },
  activeLimitTriageActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  newCardForm: {
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  newCardAreaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  newCardFormActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  waitingNudge: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderSubtle,
    borderRadius: 3,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md
  },
  waitingNudgeActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  mainQuestBadge: {
    color: lofiColors.actionAmber,
    fontSize: typography.labelSmall,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.bodyMedium,
    fontStyle: "italic"
  },
  cardTile: {
    backgroundColor: colors.bgCard,
    borderColor: colors.borderDefault,
    borderRadius: 3,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  cardLinkArea: {
    gap: spacing.sm
  },
  cardTileCompact: {
    marginTop: 0
  },
  questCardTile: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    borderLeftWidth: 3,
    gap: spacing.sm,
    padding: spacing.md
  },
  questCardWarmth: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 2,
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.2,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 3
  },
  questCardActionsWrap: {
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  questCardActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  questCardMorePanel: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginBottom: spacing.xs
  },
  cardTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.headingSmall,
    fontWeight: "700",
    lineHeight: 22
  },
  cardWarmth: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 2,
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.2,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 3
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: typography.labelMedium,
    lineHeight: 18
  },
  progressWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  progressTrack: {
    backgroundColor: colors.borderSubtle,
    borderRadius: 0,
    flex: 1,
    height: 4,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: colors.accentPrimary,
    height: 4,
    borderRadius: 0
  },
  progressText: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "700",
    width: 38
  },
  progressItem: {
    gap: spacing.xs
  },
  bigNumber: {
    color: colors.accentPrimary,
    fontSize: typography.displayLarge,
    fontWeight: "700",
    letterSpacing: -1
  },
  logItem: {
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    gap: spacing.xs,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs
  },
  smallButton: {
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  smallButtonText: {
    color: colors.textSecondary,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  splitRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  splitPanel: {
    backgroundColor: colors.bgTertiary,
    borderColor: colors.borderSubtle,
    borderRadius: 3,
    borderWidth: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 240,
    gap: spacing.xs,
    padding: spacing.md
  },
  proofShelf: {
    gap: spacing.sm
  },
  proofShelfItem: {
    borderLeftColor: lofiColors.actionAmber,
    borderLeftWidth: 3,
    gap: 3,
    paddingLeft: spacing.sm,
    paddingVertical: 2
  },
  noticeBase: {
    borderRadius: 3,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  noticeText: {
    fontSize: typography.bodyMedium,
    fontWeight: "700",
    lineHeight: 20
  },
  noticeSuccessText: {
    color: colors.accentSuccess
  },
  noticeWarningText: {
    color: lofiColors.warningAmber
  },
  noticeErrorText: {
    color: colors.accentDanger
  },
  noticeInfoText: {
    color: colors.accentPrimary
  },
  noticeSuccess: {
    backgroundColor: "rgba(122,155,110,0.1)",
    borderColor: colors.accentSuccess
  },
  noticeWarning: {
    backgroundColor: "rgba(184,146,58,0.12)",
    borderColor: lofiColors.warningAmber
  },
  noticeError: {
    backgroundColor: "rgba(220,80,50,0.1)",
    borderColor: colors.accentDanger
  },
  noticeInfo: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderDefault
  },
  bannerWarning: {
    backgroundColor: "rgba(184,146,58,0.12)",
    borderColor: lofiColors.warningAmber,
    borderRadius: 3,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: lofiColors.warningAmber,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  bannerWarningText: {
    color: lofiColors.warningAmber,
    fontSize: typography.bodyMedium,
    fontWeight: "700",
    letterSpacing: 0.2,
    lineHeight: 20
  },
  bannerInfo: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderDefault,
    borderRadius: 3,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: colors.statusCool,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  bannerInfoText: {
    color: colors.textSecondary,
    fontSize: typography.bodyMedium,
    lineHeight: 20
  },
  sectionProofPulse: {
    borderWidth: 1,
    borderColor: colors.accentSuccess,
    borderRadius: 3
  },
  sectionXp: {
    backgroundColor: colors.bgSecondary,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPrimary
  },
  sectionWarmth: {
    backgroundColor: colors.bgSecondary,
    borderLeftWidth: 3,
    borderLeftColor: colors.statusWarm
  },
  sectionProof: {
    backgroundColor: colors.bgSecondary,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentSuccess
  },
  recoveryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  recoveryItem: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 200
  },
  cardActionsColumn: {
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  cardActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  chatLayoutRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg
  },
  chatPrimaryColumn: {
    flex: 3,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 320,
    gap: spacing.lg,
    minWidth: 320
  },
  chatSecondaryColumn: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 260,
    gap: spacing.md,
    maxWidth: 340,
    minWidth: 260
  },
  chatInspectorColumn: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderSubtle,
    borderRadius: 3,
    borderWidth: 1,
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 260,
    gap: spacing.sm,
    maxWidth: 340,
    minWidth: 260,
    padding: spacing.md
  },
  chatInspectorHeader: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: spacing.xs
  },
  chatInspectorStatusLine: {
    color: colors.textTertiary,
    fontSize: typography.labelSmall,
    letterSpacing: 0.4,
    marginBottom: spacing.sm
  },
  chatSurface: {
    flexDirection: "column",
    gap: spacing.md,
    overflow: "hidden"
  },
  chatThreadToolbar: {
    flexDirection: "row",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm
  },
  chatThreadScroll: {
    flex: 1,
    minHeight: 0
  },
  chatThreadContent: {
    flexGrow: 1,
    gap: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  chatEmptyState: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl
  },
  chatEmptyStateTitle: {
    color: colors.textPrimary,
    fontSize: typography.headingSmall,
    fontWeight: "700",
    letterSpacing: 0.4,
    textAlign: "center"
  },
  chatEmptyStateCopy: {
    color: colors.textTertiary,
    fontSize: typography.bodyMedium,
    lineHeight: 22,
    maxWidth: 420,
    textAlign: "center"
  },
  chatEmptyStateSuggestions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    maxWidth: 480,
    width: "100%"
  },
  chatSuggestionCard: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  chatSuggestionCardText: {
    color: colors.textSecondary,
    fontSize: typography.bodyMedium,
    lineHeight: 22
  },
  chatBubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: lofiColors.surfaceRaised,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderRightColor: lofiColors.actionAmber,
    borderRightWidth: 3,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: "78%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  chatBubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: "85%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  chatBubbleAssistantCompanion: {
    borderLeftColor: lofiColors.softViolet,
    borderLeftWidth: 3
  },
  chatBubbleAssistantRawSignal: {
    borderLeftColor: lofiColors.dustyBlue,
    borderLeftWidth: 3
  },
  chatBubbleFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginTop: spacing.xs
  },
  chatBubbleFooterTrailing: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.xs
  },
  chatBubbleError: {
    alignSelf: "stretch",
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: "rgba(220,80,50,0.35)",
    borderLeftColor: colors.accentDanger,
    borderLeftWidth: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  chatSpeakerLabel: {
    color: colors.textMuted,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  chatAnswerText: {
    color: colors.textPrimary,
    fontSize: typography.bodyLarge,
    lineHeight: 24
  },
  chatMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  chatMetaPill: {
    backgroundColor: colors.bgTertiary,
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  chatMetaPillAccent: {
    backgroundColor: "rgba(200,168,75,0.12)",
    borderColor: lofiColors.actionAmber,
    borderRadius: 2,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  chatMetaPillText: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4
  },
  chatMetaPillTextAccent: {
    color: colors.accentPrimary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4
  },
  chatUserText: {
    color: colors.textPrimary,
    fontSize: typography.bodyMedium,
    lineHeight: 22
  },
  chatStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs
  },
  chatReadCard: {
    backgroundColor: colors.bgCard,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  chatModeNoteCompanion: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderLeftColor: lofiColors.softViolet,
    borderLeftWidth: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  chatModeNoteRawSignal: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderLeftColor: lofiColors.dustyBlue,
    borderLeftWidth: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  chatSurfaceFrameCompanion: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: "rgba(155, 139, 184, 0.45)",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "column",
    overflow: "hidden"
  },
  chatSurfaceFrameRawSignal: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: "rgba(107, 143, 163, 0.45)",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "column",
    overflow: "hidden"
  },
  chatSurfaceFrameFill: {
    flex: 1,
    minHeight: 0
  },
  chatScreenFill: {
    flex: 1,
    gap: spacing.md,
    minHeight: 0,
    padding: spacing.lg,
    paddingBottom: 0
  },
  chatPrimaryColumnFill: {
    flex: 1,
    minHeight: 0
  },
  chatReasoningPanel: {
    alignSelf: "stretch",
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md
  },
  chatReasoningPanelRawSignal: {
    borderLeftColor: lofiColors.dustyBlue,
    borderLeftWidth: 3
  },
  chatReasoningHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  chatReasoningHeaderText: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  chatReasoningTitle: {
    color: colors.textMuted,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  chatReasoningStatus: {
    color: colors.textMuted,
    fontSize: typography.labelSmall
  },
  chatReasoningChevron: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "600"
  },
  chatReasoningSteps: {
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  chatReasoningStep: {
    color: colors.textMuted,
    fontSize: typography.bodySmall,
    lineHeight: 18
  },
  chatReasoningStepActive: {
    color: colors.textSecondary,
    fontSize: typography.bodySmall,
    lineHeight: 18
  },
  chatReasoningPlaceholderNote: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontStyle: "italic",
    marginTop: spacing.xs
  },
  chatReasoningDepthPillCompanion: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(155, 139, 184, 0.12)",
    borderColor: lofiColors.softViolet,
    borderRadius: 2,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  chatReasoningDepthPillRawSignal: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(107, 143, 163, 0.12)",
    borderColor: lofiColors.dustyBlue,
    borderRadius: 2,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  chatReasoningDepthPillTextCompanion: {
    color: lofiColors.softViolet,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4
  },
  chatReasoningDepthPillTextRawSignal: {
    color: lofiColors.dustyBlue,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4
  },
  signalStrip: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  signalStripCompanion: {
    borderLeftColor: lofiColors.softViolet,
    borderLeftWidth: 3
  },
  signalStripWarning: {
    borderLeftColor: lofiColors.warningAmber,
    borderLeftWidth: 3
  },
  signalStripProof: {
    borderLeftColor: lofiColors.actionAmber,
    borderLeftWidth: 3
  },
  signalStripLabel: {
    color: colors.textMuted,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  signalStripText: {
    color: colors.textSecondary,
    fontSize: typography.bodySmall,
    lineHeight: 18
  },
  chatSurfaceThreadSlot: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden"
  },
  chatSurfaceComposerSlot: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
    flexShrink: 0
  },
  chatAdvancedPanel: {
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  chatAdvancedPanelToggle: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingVertical: spacing.sm
  },
  chatAdvancedPanelToggleText: {
    color: colors.textMuted,
    fontSize: typography.labelMedium,
    fontWeight: "600"
  },
  chatAdvancedPanelBody: {
    gap: spacing.md
  },
  synthesisNextPounceHero: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderAccent,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  synthesisBulletRow: {
    paddingLeft: spacing.xs
  },
  chatComposer: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    borderTopWidth: 1,
    borderWidth: 0,
    gap: spacing.sm,
    padding: spacing.md
  },
  chatComposerInputRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.sm
  },
  chatComposerInput: {
    backgroundColor: colors.bgPrimary,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.inputText,
    flex: 1,
    fontSize: typography.bodyMedium,
    lineHeight: 22,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: "top"
  },
  chatComposerHint: {
    color: colors.textTertiary,
    fontSize: typography.labelSmall,
    letterSpacing: 0.3
  },
  chatComposerHintCentered: {
    textAlign: "center"
  },
  chatComposerCentered: {
    alignItems: "center"
  },
  chatComposerBodyNarrow: {
    gap: spacing.sm,
    width: "58%"
  },
  chatComposerShell: {
    alignItems: "center",
    backgroundColor: colors.bgPrimary,
    borderColor: colors.borderSubtle,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  chatComposerShellExpanded: {
    alignItems: "flex-end"
  },
  chatComposerInputWrap: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0
  },
  chatComposerInputWrapExpanded: {
    alignSelf: "stretch",
    justifyContent: "flex-start"
  },
  chatComposerInputInline: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.inputText,
    flex: 1,
    fontSize: typography.bodyMedium,
    lineHeight: 22,
    minHeight: 32,
    paddingHorizontal: 0,
    paddingVertical: 0
  },
  chatComposerTrailing: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.sm
  },
  chatComposerSendCircle: {
    alignItems: "center",
    backgroundColor: colors.accentPrimary,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  chatComposerSendCircleDisabled: {
    backgroundColor: "rgba(200,168,75,0.25)",
    opacity: 0.55
  },
  chatComposerSendArrow: {
    color: "#0E100A",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20
  },
  chatComposerQuickWrap: {
    flexShrink: 0,
    position: "relative",
    zIndex: 2
  },
  chatComposerQuickMenu: {
    backgroundColor: colors.bgCard,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    bottom: "100%",
    gap: spacing.xs,
    left: 0,
    marginBottom: spacing.xs,
    minWidth: 240,
    padding: spacing.xs,
    position: "absolute",
    zIndex: 10
  },
  chatComposerQuickMenuItem: {
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  chatComposerQuickMenuItemLabel: {
    color: colors.textSecondary,
    fontSize: typography.bodySmall,
    lineHeight: 18
  },
  chatComposerQuickTrigger: {
    alignItems: "center",
    backgroundColor: colors.bgPrimary,
    borderColor: colors.borderSubtle,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  chatComposerQuickTriggerText: {
    color: colors.textSecondary,
    fontSize: 20,
    fontWeight: "400",
    lineHeight: 22
  },
  chatComposerDepthWrap: {
    flexShrink: 0,
    position: "relative",
    zIndex: 2
  },
  chatComposerDepthMenu: {
    backgroundColor: colors.bgCard,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    bottom: "100%",
    gap: spacing.xs,
    marginBottom: spacing.xs,
    minWidth: 220,
    padding: spacing.xs,
    position: "absolute",
    right: 0,
    zIndex: 10
  },
  chatComposerDepthMenuItem: {
    borderRadius: 4,
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  chatComposerDepthMenuItemActive: {
    backgroundColor: "rgba(200,168,75,0.1)",
    borderRadius: 4,
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  chatComposerDepthMenuItemLabel: {
    color: colors.textSecondary,
    fontSize: typography.labelMedium,
    fontWeight: "600"
  },
  chatComposerDepthMenuItemLabelActive: {
    color: colors.accentPrimary,
    fontSize: typography.labelMedium,
    fontWeight: "700"
  },
  chatComposerDepthMenuItemHint: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    lineHeight: 16
  },
  chatComposerDepthTrigger: {
    alignItems: "center",
    backgroundColor: colors.bgPrimary,
    borderColor: colors.borderSubtle,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    height: 36,
    justifyContent: "center",
    minWidth: 72,
    paddingHorizontal: spacing.sm
  },
  chatComposerDepthTriggerText: {
    color: colors.textSecondary,
    fontSize: typography.labelMedium,
    fontWeight: "600"
  },
  chatComposerDepthChevron: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 12
  },
  chatComposerRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end"
  },
  chatSendButton: {
    backgroundColor: colors.accentPrimary,
    borderRadius: 6,
    minWidth: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  chatQuickChip: {
    backgroundColor: colors.bgPrimary,
    borderColor: colors.borderSubtle,
    borderRadius: 3,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  chatQuickChipText: {
    color: colors.textTertiary,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.8
  },
  chatInspectorSection: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingTop: spacing.sm
  },
  chatInspectorSectionTitle: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  chatInspectorToggle: {
    alignSelf: "flex-start",
    paddingVertical: 2
  },
  chatInspectorToggleText: {
    color: colors.textMuted,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  chatBubbleToggle: {
    alignSelf: "flex-start",
    paddingVertical: 2
  },
  chatBubbleToggleText: {
    color: colors.textTertiary,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.4
  },
  chatMemoryTools: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingTop: spacing.sm
  },
  chatBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.bgTertiary,
    borderColor: colors.borderSubtle,
    borderRadius: 2,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3
  },
  chatBadgeText: {
    color: colors.textMuted,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  chatStateStrip: {
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  chatStateStripCompanion: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: "rgba(155, 139, 184, 0.35)"
  },
  chatStateStripRawSignal: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: "rgba(107, 143, 163, 0.35)"
  },
  chatStateChip: {
    backgroundColor: lofiColors.surfaceRaised,
    borderColor: colors.borderSubtle,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  chatStateChipAccent: {
    backgroundColor: "rgba(200,168,75,0.1)",
    borderColor: lofiColors.actionAmber,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  chatStateChipWarning: {
    backgroundColor: "rgba(184,146,58,0.12)",
    borderColor: lofiColors.warningAmber,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  chatStateChipActive: {
    backgroundColor: lofiColors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  chatStateChipText: {
    color: colors.textSecondary,
    fontSize: typography.labelSmall,
    fontWeight: "600"
  },
  chatStateChipTextAccent: {
    color: lofiColors.actionAmber,
    fontSize: typography.labelSmall,
    fontWeight: "600"
  },
  chatStateChipTextWarning: {
    color: lofiColors.warningAmber,
    fontSize: typography.labelSmall,
    fontWeight: "600"
  },
  chatBackroomPanel: {
    backgroundColor: lofiColors.surfaceQuiet,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    gap: spacing.sm,
    maxHeight: 420,
    overflow: "hidden"
  },
  chatBackroomPanelSide: {
    flexBasis: 320,
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: 340,
    minWidth: 260
  },
  chatBackroomHeader: {
    alignItems: "center",
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  chatBackroomHeaderTitle: {
    color: colors.textMuted,
    fontFamily: lofiTypography.fontLofiMono,
    fontSize: typography.labelSmall,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  chatBackroomBody: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md
  },
  chatBackroomSection: {
    gap: spacing.sm
  },
  chatBackroomSectionFocused: {
    borderColor: colors.borderStrong,
    borderRadius: 4,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm
  },
  memoryReviewCard: {
    backgroundColor: lofiColors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: 4,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.sm
  },
  memoryReviewCardText: {
    color: colors.textSecondary,
    fontSize: typography.bodySmall,
    fontStyle: "italic",
    lineHeight: 20
  },
  memoryReviewCardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  messageActionToggle: {
    alignSelf: "flex-start",
    paddingVertical: 2
  },
  messageActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  chatBackroomChatRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.lg
  },
  chatBackroomChatColumn: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    gap: spacing.md,
    minWidth: 0
  },
  chatBackroomChatRowFill: {
    alignItems: "stretch",
    flex: 1,
    minHeight: 0
  },
  chatBackroomChatColumnFill: {
    flex: 1,
    minHeight: 0
  }
});

// Export color tokens for components that need dynamic styling
export { colors, typography, spacing, lofiColors, lofiTypography };

export const colorPrimaryAction = lofiColors.actionAmber;
export const colorWarning = lofiColors.warningAmber;
export const colorCompanion = lofiColors.softViolet;
export const colorRawSignal = lofiColors.dustyBlue;
export const colorProofBuild = lofiColors.actionAmber;
export const colorProofCareer = lofiColors.fadedRose;
export const colorProofBody = lofiColors.mossGreen;

export function questCardAreaAccentColor(area: LifeArea): string {
  switch (area) {
    case "build":
      return lofiColors.actionAmber;
    case "body":
      return lofiColors.mossGreen;
    case "social_career":
      return lofiColors.fadedRose;
    case "money_independence":
      return lofiColors.dustyBlue;
    case "stability_vices":
      return lofiColors.softViolet;
  }
}
