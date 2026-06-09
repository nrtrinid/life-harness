import { StyleSheet } from "react-native";

// Theme 2: Field Ops
// Colors
const colors = {
  // Backgrounds
  bgPrimary: "#0E100A",        // Deep olive black
  bgSecondary: "#161910",      // Dark olive
  bgTertiary: "#1C1F16",       // Medium olive
  bgCard: "#161910",           // Card surface
  
  // Borders
  borderSubtle: "rgba(200,168,75,0.08)",
  borderDefault: "rgba(200,168,75,0.15)",
  borderStrong: "rgba(200,168,75,0.25)",
  borderAccent: "#C8A84B",     // Brass
  
  // Text
  textPrimary: "#D4D8C8",      // Light warm gray
  textSecondary: "rgba(212,216,200,0.85)",
  textTertiary: "rgba(212,216,200,0.6)",
  textMuted: "rgba(212,216,200,0.35)",
  textLabel: "rgba(200,168,75,0.6)",
  
  // Accents
  accentPrimary: "#C8A84B",    // Brass gold
  accentDanger: "#DC5032",     // Alert red
  accentSuccess: "#7A9B6E",    // Olive green
  accentWarm: "rgba(200,168,75,0.3)",
  
  // Status
  statusHot: "#C8A84B",
  statusWarm: "#9B8755",
  statusCool: "#7A7E68",
  statusCold: "#5A5D52",
  
  // Input
  inputBg: "#0E100A",
  inputBorder: "rgba(200,168,75,0.12)",
  inputText: "#D4D8C8",
  inputPlaceholder: "rgba(212,216,200,0.3)"
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
  navRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  navButton: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  navButtonActive: {
    backgroundColor: colors.bgTertiary,
    borderWidth: 1,
    borderColor: colors.borderAccent,
    borderRadius: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  navButtonText: {
    color: colors.accentPrimary,
    fontSize: typography.labelMedium,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase"
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
    color: colors.textLabel,
    fontSize: typography.labelMedium,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: 6,
    marginBottom: spacing.xs
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
    color: colors.textLabel,
    fontSize: typography.labelMedium,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
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
    letterSpacing: 1.4,
    textTransform: "uppercase"
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
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase"
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
    color: colors.textLabel,
    fontSize: typography.labelLarge,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs
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
    color: colors.textLabel,
    fontSize: typography.labelSmall,
    fontWeight: "700",
    letterSpacing: 1.2,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 3,
    textTransform: "uppercase"
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
    color: colors.textPrimary,
    fontSize: typography.labelSmall,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase"
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
    borderLeftColor: colors.accentPrimary,
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
    color: colors.accentPrimary
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
    backgroundColor: "rgba(200,168,75,0.1)",
    borderColor: colors.accentPrimary
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
    backgroundColor: "rgba(200,168,75,0.12)",
    borderColor: colors.accentPrimary,
    borderRadius: 3,
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  bannerWarningText: {
    color: colors.accentPrimary,
    fontSize: typography.bodyMedium,
    fontWeight: "700",
    letterSpacing: 0.5,
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
  }
});

// Export color tokens for components that need dynamic styling
export { colors, typography, spacing };
