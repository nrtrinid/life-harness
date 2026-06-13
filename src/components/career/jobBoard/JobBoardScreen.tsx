import { Link, type Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Notice, type NoticeState } from "../../Notice";
import { CareerNextContractCard } from "../CareerNextContractCard";
import { StarterSourceBanner } from "../StarterSourceBanner";
import { styles } from "../../styles";
import { buildCareerHubSummary } from "../../../core/careerHub";
import { buildCareerPipelineState } from "../../../core/careerPipeline";
import { resolveJobBoardTab, type JobBoardTab } from "../../../core/jobBoardTab";
import { requestJobScoutRunnerStart } from "../../../core/jobScoutRunnerClient";
import { useRunnerHealth } from "../../../hooks/useRunnerHealth";
import { useLifeHarness } from "../../../state/LifeHarnessState";
import { JobBoardAddJobSheet } from "./JobBoardAddJobSheet";
import { JobBoardApplyTab } from "./JobBoardApplyTab";
import { JobBoardFindTab } from "./JobBoardFindTab";
import { JobBoardFollowUpTab } from "./JobBoardFollowUpTab";
import { JobBoardHandoffBanner, type JobBoardHandoff } from "./JobBoardHandoffBanner";
import { JobBoardReviewTab } from "./JobBoardReviewTab";
import { JobBoardStepper } from "./JobBoardStepper";

function parseAddParam(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1" || raw === "true";
}

export function JobBoardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; add?: string }>();
  const {
    jobCandidates,
    cards,
    jobSources,
    jobSourceRuns,
    resumeModules,
    careerSourcePack,
    dailyState,
    dismissStarterSourceAnnouncement
  } = useLifeHarness();
  const { ok: runnerOk } = useRunnerHealth();
  const devAutoStartAttempted = useRef(false);

  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [handoff, setHandoff] = useState<JobBoardHandoff | null>(null);

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
  const pipeline = buildCareerPipelineState(
    jobCandidates,
    cards,
    jobSources,
    jobSourceRuns,
    now
  );
  const activeTab = resolveJobBoardTab(params.tab, summary);
  const showAddSheet = parseAddParam(params.add);

  useEffect(() => {
    if (!__DEV__ || runnerOk || devAutoStartAttempted.current) {
      return;
    }
    devAutoStartAttempted.current = true;
    void requestJobScoutRunnerStart();
  }, [runnerOk]);

  function selectTab(tab: JobBoardTab, options?: { clearAdd?: boolean }) {
    setHandoff(null);
    router.setParams({
      tab,
      ...(options?.clearAdd || showAddSheet ? { add: "" } : {})
    });
  }

  function closeAddSheet() {
    router.setParams({ add: "" });
  }

  function handleNotice(kind: "success" | "warning" | "info", message: string) {
    setNotice({ kind, message });
  }

  function handleFindHandoff(next: JobBoardHandoff) {
    setHandoff(next);
  }

  function handleReviewHandoff() {
    setHandoff({ tab: "apply", message: "Application card created — resume work on Apply tab" });
    handleNotice("success", "Application card created.");
  }

  function continueHandoff() {
    if (!handoff) {
      return;
    }
    selectTab(handoff.tab);
  }

  return (
    <View style={{ gap: 12 }}>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      {(dailyState.newStarterSourceIds?.length ?? 0) > 0 ? (
        <StarterSourceBanner
          sourceIds={dailyState.newStarterSourceIds ?? []}
          onDismiss={dismissStarterSourceAnnouncement}
        />
      ) : null}

      <JobBoardStepper activeTab={activeTab} pipeline={pipeline} onSelectTab={selectTab} />

      <CareerNextContractCard action={summary.nextAction} onTabPress={selectTab} />

      {handoff ? (
        <JobBoardHandoffBanner
          handoff={handoff}
          onContinue={continueHandoff}
          onDismiss={() => setHandoff(null)}
        />
      ) : null}

      {showAddSheet ? (
        <JobBoardAddJobSheet
          onClose={closeAddSheet}
          onPasteJob={() => {
            selectTab("find", { clearAdd: true });
          }}
        />
      ) : null}

      {activeTab === "find" ? (
        <JobBoardFindTab
          onSelectTab={selectTab}
          onNotice={handleNotice}
          onHandoff={handleFindHandoff}
        />
      ) : null}
      {activeTab === "review" ? (
        <JobBoardReviewTab embedded onApplicationStarted={handleReviewHandoff} />
      ) : null}
      {activeTab === "apply" ? <JobBoardApplyTab onSelectTab={selectTab} /> : null}
      {activeTab === "followup" ? <JobBoardFollowUpTab /> : null}

      <View style={{ gap: 6, marginTop: 4 }}>
        <Text style={styles.lofiTapeLabel}>More career tools</Text>
        <View style={styles.cardActionsRow}>
          <Link href="/resume-bank" asChild>
            <Pressable style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Resume Bank</Text>
            </Pressable>
          </Link>
          <Link href="/career-pack" asChild>
            <Pressable style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Career Pack</Text>
            </Pressable>
          </Link>
          <Link href="/job-sources" asChild>
            <Pressable style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Sources</Text>
            </Pressable>
          </Link>
          <Link href={"/source-setup" as Href} asChild>
            <Pressable style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Source setup</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}
