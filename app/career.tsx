import { buildCareerHubSummary } from "../src/core/careerHub";
import { JobBoardScreen } from "../src/components/career/jobBoard/JobBoardScreen";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { useLifeHarness } from "../src/state/LifeHarnessState";

export default function CareerScreen() {
  const {
    jobCandidates,
    cards,
    jobSources,
    jobSourceRuns,
    resumeModules,
    careerSourcePack
  } = useLifeHarness();

  const now = new Date();
  const summary = buildCareerHubSummary({
    jobCandidates,
    cards,
    jobSources,
    jobSourceRuns,
    resumeModules,
    hasCareerPack: Boolean(careerSourcePack),
    now
  });

  const chips = [
    { label: `${summary.queueCount} in queue`, accent: summary.queueCount > 0 },
    {
      label: `${summary.activeApplicationCount + summary.waitingApplicationCount} applications`,
      accent: summary.activeApplicationCount + summary.waitingApplicationCount > 0
    },
    { label: `${summary.followUpCount} follow-ups`, accent: summary.followUpCount > 0 },
    { label: `${summary.dueSourceCount} due sources`, accent: summary.dueSourceCount > 0 },
    { label: summary.hasCareerPack ? "pack imported" : "no pack" }
  ];

  return (
    <Screen>
      <PageHeader
        title="Jobs"
        subtitle="Find → Review → Apply → Follow up"
        chips={chips}
      />
      <JobBoardScreen />
    </Screen>
  );
}
