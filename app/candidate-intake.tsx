import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { JobBoardFindTab } from "../src/components/career/jobBoard/JobBoardFindTab";
import { Notice, type NoticeState } from "../src/components/Notice";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { styles } from "../src/components/styles";

export default function CandidateIntakeScreen() {
  const router = useRouter();
  const [notice, setNotice] = useState<NoticeState | null>(null);

  function handleNotice(kind: "success" | "warning" | "info", message: string) {
    setNotice({ kind, message });
  }

  return (
    <Screen>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <PageHeader
        title="Paste a job posting"
        subtitle="Add one role to the review queue. Sources can wait."
      />
      <Link href="/career" asChild>
        <Pressable style={[styles.secondaryAction, { alignSelf: "flex-start", marginBottom: 8 }]}>
          <Text style={styles.secondaryActionText}>Back to Jobs</Text>
        </Pressable>
      </Link>
      <JobBoardFindTab
        pasteOnly
        onSelectTab={() => router.push("/job-candidates")}
        onNotice={handleNotice}
      />
    </Screen>
  );
}
