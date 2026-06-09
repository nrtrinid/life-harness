import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import {
  FIT_SCORE_DISCLAIMER,
  RESUME_MODULE_CATEGORY_LABELS,
  ROLE_TYPE_LABELS
} from "../src/core/labels";
import { useLifeHarness } from "../src/state/LifeHarnessState";

export default function ResumeBankScreen() {
  const { resumeModules } = useLifeHarness();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Screen>
      <Nav />
      <Text style={styles.screenIntro}>
        Structured resume bank for deterministic matching. No resume generation here.
      </Text>
      <Section title="Resume Modules">
        {resumeModules.map((module) => {
          const expanded = expandedId === module.id;
          return (
            <View key={module.id} style={styles.cardTile}>
              <Pressable onPress={() => setExpandedId(expanded ? null : module.id)}>
                <Text style={styles.titleText}>{module.title}</Text>
                <Text style={styles.bodyText}>
                  {RESUME_MODULE_CATEGORY_LABELS[module.category]} ·{" "}
                  {module.isActive ? "Active" : "Inactive"}
                </Text>
                <Text style={styles.helpText}>{module.summary}</Text>
              </Pressable>
              {expanded ? (
                <View style={{ marginTop: 8, gap: 4 }}>
                  <Text style={styles.label}>Tags</Text>
                  <Text style={styles.bodyText}>{module.tags.join(", ")}</Text>
                  <Text style={styles.label}>Skills</Text>
                  <Text style={styles.bodyText}>{module.skills.join(", ")}</Text>
                  <Text style={styles.label}>Best For</Text>
                  <Text style={styles.bodyText}>
                    {module.bestFor.map((role) => ROLE_TYPE_LABELS[role]).join(", ")}
                  </Text>
                  <Text style={styles.label}>Bullets</Text>
                  {module.bullets.map((bullet) => (
                    <Text key={bullet} style={styles.listItem}>
                      ▸ {bullet}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </Section>
      <Text style={styles.helpText}>{FIT_SCORE_DISCLAIMER}</Text>
    </Screen>
  );
}
