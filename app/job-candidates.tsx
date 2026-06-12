import { Link } from "expo-router";
import { Pressable, Text } from "react-native";

import { JobBoardReviewTab } from "../src/components/career/jobBoard/JobBoardReviewTab";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { styles } from "../src/components/styles";

export default function JobCandidatesScreen() {
  return (
    <Screen>
      <PageHeader
        title="Queue"
        subtitle="Full review queue — also available on the Jobs board Review tab."
      />
      <Link href="/career?tab=review" asChild>
        <Pressable style={styles.secondaryAction}>
          <Text style={styles.secondaryActionText}>Back to Jobs board</Text>
        </Pressable>
      </Link>
      <JobBoardReviewTab embedded />
    </Screen>
  );
}
