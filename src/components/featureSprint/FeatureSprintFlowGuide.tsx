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
  "1. Start feature panel — paste ChatGPT web spec, choose source, Save spec.",
  "2. Approve feature spec — required before Run implementation when a spec is saved.",
  "3. Check setup — project metadata, repo path, runner.",
  "4. Scope it — copy scoping packet or run scoping with the selected runner agent (Cursor or Codex).",
  "5. Import plan — inspect output, then click Import plan."
] as const;

const AFTER_PLAN_STEPS = [
  "0. Optional: Copy for Cursor localization → import localization (read-only repo map)",
  "1. Optional: Copy for Codex prompt audit → Run prompt audit with Codex → import (Codex-only)",
  "2. Run implementation in worktree (selected agent)",
  "3. View details — open the run in Recent runner runs",
  "4. Inspect output, changed files, diff, and verification",
  "5. Save agent output",
  "6. Normalize for review",
  "7. Run review with the selected agent or copy review packet",
  "8. Import review verdict",
  "9. Advance step — repeat from step 2 for the next slice",
  "10. Mark feature complete",
  "11. Clean worktree — View details → Clean worktree; Force clean only after inspecting output/diff"
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
