import { describe, expect, it } from "vitest";

import {
  applyApproveJobCandidate,
  applyRunJobSourceResult,
  type LifeHarnessData
} from "./actions";
import { checkJobScoutLocks } from "./jobScout";
import { seedJobCandidates, seedJobSources, seedResumeModules } from "../data/seedJobScout";
import { seedCards, seedDailyState, seedLogs, seedProofItems } from "../data/seed";
import {
  buildFetchErrorRunOutput,
  dedupeJobPostings,
  runJobSourceFromRaw
} from "./jobSourceRunner";
import type { JobSource } from "./types";

const greenhouseFixture = {
  jobs: [
    {
      title: "Software Engineer — Security",
      location: { name: "Remote" },
      absolute_url: "https://boards.example.com/jobs/1001",
      content: "Python, TypeScript, React, security, application security."
    }
  ]
};

const fixtureSource: JobSource = {
  id: "source-fixture-greenhouse",
  name: "Local Fixture Source",
  url: "/fixtures/sample-greenhouse.json",
  kind: "greenhouse",
  enabled: true,
  cadence: "manual"
};

function createState(): LifeHarnessData {
  return {
    cards: structuredClone(seedCards),
    logs: structuredClone(seedLogs),
    proofItems: structuredClone(seedProofItems),
    dailyState: structuredClone(seedDailyState),
    resumeModules: structuredClone(seedResumeModules),
    jobCandidates: structuredClone(seedJobCandidates),
    jobSources: structuredClone(seedJobSources),
    jobSourceRuns: []
  };
}

describe("jobSourceRunner", () => {
  it("dedupes by sourceUrl + company + roleTitle", () => {
    const postings = [
      {
        company: "Acme",
        roleTitle: "Security Engineer",
        sourceUrl: "https://example.com/1",
        description: "security python"
      }
    ];
    const existing = [
      {
        ...seedJobCandidates[0],
        company: "Acme",
        roleTitle: "Security Engineer",
        sourceUrl: "https://example.com/1"
      }
    ];
    const result = dedupeJobPostings(postings, existing);
    expect(result.unique).toHaveLength(0);
    expect(result.skippedDuplicates).toBe(1);
  });

  it("creates source_fetch candidates without application cards", () => {
    const output = runJobSourceFromRaw(fixtureSource, greenhouseFixture, [], seedResumeModules);
    expect(output.result.errors).toHaveLength(0);
    expect(output.candidates).toHaveLength(1);
    expect(output.candidates[0]?.origin).toBe("source_fetch");
    expect(output.candidates[0]?.status).toBe("new");
  });

  it("records skipped duplicates on second run", () => {
    const first = runJobSourceFromRaw(fixtureSource, greenhouseFixture, [], seedResumeModules);
    const second = runJobSourceFromRaw(
      fixtureSource,
      greenhouseFixture,
      first.candidates,
      seedResumeModules
    );
    expect(second.result.createdCandidateIds).toHaveLength(0);
    expect(second.result.skippedDuplicates).toBe(1);
  });

  it("approving fetched candidate creates one inbox card with links", () => {
    const output = runJobSourceFromRaw(fixtureSource, greenhouseFixture, [], seedResumeModules);
    let state = createState();
    const runResult = applyRunJobSourceResult(state, output);
    state = runResult.state;
    const candidateId = output.candidates[0]?.id;
    expect(candidateId).toBeDefined();

    const approve = applyApproveJobCandidate(state, candidateId!);
    expect(approve.ok).toBe(true);
    const card = approve.state.cards.find((item) => item.id === approve.cardId);
    const candidate = approve.state.jobCandidates.find((item) => item.id === candidateId);
    expect(card?.state).toBe("inbox");
    expect(candidate?.status).toBe("card_created");
    expect(candidate?.applicationCardId).toBe(card?.id);
    expect(card?.careerApplication?.jobCandidateId).toBe(candidateId);

    const again = applyApproveJobCandidate(approve.state, candidateId!);
    expect(again.state.cards.filter((item) => item.careerApplication).length).toBe(
      approve.state.cards.filter((item) => item.careerApplication).length
    );
  });

  it("records fetch errors without candidates", () => {
    const output = buildFetchErrorRunOutput(
      fixtureSource,
      "Fetch blocked — likely CORS. v0.3 has no backend proxy."
    );
    const result = applyRunJobSourceResult(createState(), output);
    expect(result.ok).toBe(false);
    expect(result.state.jobCandidates).toHaveLength(seedJobCandidates.length);
    expect(result.state.jobSourceRuns[0]?.errors[0]).toContain("CORS");
  });

  it("uses manual-run enabled and scheduled lock thresholds", () => {
    const locks = checkJobScoutLocks([], [], [], []);
    expect(locks.find((lock) => lock.id === "manual-run-fetching")?.enabled).toBe(true);
    expect(locks.find((lock) => lock.id === "scheduled-fetching")?.required).toBe(5);
  });
});
