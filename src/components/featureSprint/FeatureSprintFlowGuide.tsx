import { Text, View } from "react-native";

import { CollapsibleSection } from "../CollapsibleSection";
import { styles } from "../styles";

const BOUNDARY_LINES = [
  "Runner fills textareas.",
  "You still import, save, and advance manually.",
  "Feature Sprints Workbench is a dashboard.",
  "Card Backroom is the control surface."
] as const;

const BEFORE_PLAN_STEPS = [
  "1. Start feature panel — describe the feature (optional rough spec).",
  "2. Check setup — project metadata, repo path, runner.",
  "3. Scope it — copy scoping packet or run scoping with Codex.",
  "4. Import plan — inspect output, then click Import plan."
] as const;

const AFTER_PLAN_STEPS = [
  "1. Run implementation in worktree",
  "2. View details — open the run in Recent runner runs",
  "3. Inspect output, changed files, diff, and verification",
  "4. Save agent output",
  "5. Run review with Codex or copy review packet",
  "6. Import review verdict",
  "7. Advance step — repeat from step 1 for the next slice",
  "8. Mark feature complete",
  "9. Clean worktree — View details → Clean worktree; Force clean only after inspecting output/diff"
] as const;

export function FeatureSprintFlowGuide() {
  return (
    <CollapsibleSection title="How this flow works" defaultOpen={false}>
      <Text style={styles.label}>Boundaries</Text>
      <View style={{ gap: 4, marginTop: 4 }}>
        {BOUNDARY_LINES.map((line) => (
          <Text key={line} style={styles.helpText}>
            ▸ {line}
          </Text>
        ))}
      </View>

      <Text style={[styles.label, { marginTop: 12 }]}>Before you have a plan</Text>
      <View style={{ gap: 4, marginTop: 4 }}>
        {BEFORE_PLAN_STEPS.map((step) => (
          <Text key={step} style={styles.helpText}>
            {step}
          </Text>
        ))}
      </View>

      <Text style={[styles.label, { marginTop: 12 }]}>After you import a plan</Text>
      <View style={{ gap: 4, marginTop: 4 }}>
        {AFTER_PLAN_STEPS.map((step) => (
          <Text key={step} style={styles.helpText}>
            {step}
          </Text>
        ))}
      </View>

      <Text style={[styles.helpText, { marginTop: 12 }]}>
        Mock dogfood: npm run feature-runner — every step still requires an explicit click.
      </Text>
    </CollapsibleSection>
  );
}
