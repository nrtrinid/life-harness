import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { styles } from "../src/components/styles";
import { buildCareerPipelineState } from "../src/core/careerPipeline";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const CAREER_TOOL_LINKS = [
  { href: "/career-intake", label: "Intake", description: "Create an application card directly" },
  { href: "/candidate-intake", label: "Paste", description: "Paste a job posting into the queue" },
  { href: "/job-candidates", label: "Queue", description: "Review and approve candidates" },
  { href: "/resume-bank", label: "Bank", description: "Resume modules for applications" },
  { href: "/job-sources", label: "Sources", description: "Run approved job sources" },
  { href: "/source-setup", label: "Setup", description: "Detect and save source adapters" }
] as const;

export default function CareerScreen() {
  const { jobCandidates, cards, jobSources, jobSourceRuns } = useLifeHarness();
  const now = new Date();
  const pipeline = buildCareerPipelineState(jobCandidates, cards, jobSources, jobSourceRuns, now);

  const chips = [
    {
      label: `${pipeline.candidatesWaiting} in queue`,
      accent: pipeline.candidatesWaiting > 0
    },
    {
      label: `${pipeline.activeApplications.length} active apps`,
      accent: pipeline.activeApplications.length > 0
    },
    {
      label: `${pipeline.followUpsDue.length} follow-ups`,
      accent: pipeline.followUpsDue.length > 0
    },
    {
      label: `${pipeline.dueSources} due sources`,
      accent: pipeline.dueSources > 0
    }
  ];

  return (
    <Screen>
      <Nav />
      <PageHeader
        title="Career"
        subtitle="Career pipeline — review queue, sources, and applications."
        chips={chips}
      />

      {pipeline.lastRun ? (
        <Text style={styles.helpText}>
          Last source run: {pipeline.lastRun.sourceName} · {pipeline.lastRun.createdCount} created ·{" "}
          {pipeline.lastRun.timestamp.slice(0, 16).replace("T", " ")}
        </Text>
      ) : (
        <Text style={styles.helpText}>No source runs yet — open Sources or Setup to get started.</Text>
      )}

      <View style={styles.checklist}>
        {CAREER_TOOL_LINKS.map((item) => (
          <Link key={item.href} href={item.href} asChild>
            <Pressable style={styles.chatSuggestionCard}>
              <Text style={styles.chatSuggestionCardText}>{item.label}</Text>
              <Text style={styles.helpText}>{item.description}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </Screen>
  );
}
