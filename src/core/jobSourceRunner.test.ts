import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  canRunJobSource,
  dedupeJobPostings,
  PREVIEW_JOB_SOURCE_ID,
  finalizeJobSourceFromPostings,
  rebindJobSourceRunOutput,
  runJobSourceFromRaw,
  runPaginatedJobSourceFromRaw
} from "./jobSourceRunner";
import { GOVERNMENTJOBS_ZERO_LISTINGS_MESSAGE, WORKDAY_ZERO_LISTINGS_MESSAGE } from "./jobSourceAdapters";
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

const governmentJobsFixtureHtml = readFileSync(
  join(process.cwd(), "public/fixtures/sample-governmentjobs-listing.html"),
  "utf8"
);

const governmentJobsSource: JobSource = {
  id: "source-fixture-governmentjobs",
  name: "County of San Diego",
  url: "/fixtures/sample-governmentjobs-listing.html",
  kind: "governmentjobs",
  enabled: true,
  cadence: "manual",
  maxResults: 25
};

const workdaySearchJson = readFileSync(
  join(process.cwd(), "public/fixtures/sample-workday-search.json"),
  "utf8"
);
const workdayEmptyJson = readFileSync(
  join(process.cwd(), "public/fixtures/sample-workday-empty.json"),
  "utf8"
);
const workdayCxsResponseJson = readFileSync(
  join(process.cwd(), "public/fixtures/sample-workday-cxs-response.json"),
  "utf8"
);

const workdaySource: JobSource = {
  id: "source-fixture-workday",
  name: "Qualcomm",
  url: "/fixtures/sample-workday-search.json",
  kind: "workday",
  enabled: true,
  cadence: "manual",
  maxResults: 25
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
    jobSourceRuns: [],
    chatSummaries: [],
    memoryItems: [],
    projects: [],
    agentSessions: [],
    careerSourcePack: null
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

  it("scores source-created candidates with enriched fit fields", () => {
    const output = runJobSourceFromRaw(fixtureSource, greenhouseFixture, [], seedResumeModules);
    const candidate = output.candidates[0];
    expect(candidate?.fitLabel).toBeTruthy();
    expect(candidate?.fitScore).toBeGreaterThanOrEqual(0);
    expect(candidate?.fitReasons.length).toBeGreaterThan(0);
    expect(candidate?.origin).toBe("source_fetch");
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

  it("rebinds preview source ids to saved source id on import", () => {
    const previewSource: JobSource = { ...fixtureSource, id: PREVIEW_JOB_SOURCE_ID };
    const output = runJobSourceFromRaw(previewSource, greenhouseFixture, [], seedResumeModules);
    expect(output.result.sourceId).toBe(PREVIEW_JOB_SOURCE_ID);
    expect(output.candidates[0]?.sourceId).toBe(PREVIEW_JOB_SOURCE_ID);

    const savedSource: JobSource = { ...fixtureSource, id: "job-source-saved-abc" };
    const rebound = rebindJobSourceRunOutput(output, savedSource);
    expect(rebound.result.sourceId).toBe("job-source-saved-abc");
    expect(rebound.candidates.every((candidate) => candidate.sourceId === "job-source-saved-abc")).toBe(
      true
    );
  });

  it("creates source_fetch candidates from governmentjobs fixture HTML", () => {
    const output = runJobSourceFromRaw(
      governmentJobsSource,
      governmentJobsFixtureHtml,
      [],
      seedResumeModules
    );
    expect(output.result.errors).toHaveLength(0);
    expect(output.candidates.length).toBeGreaterThanOrEqual(2);
    expect(output.candidates.every((candidate) => candidate.origin === "source_fetch")).toBe(true);
    expect(output.updatedSource.runStatus).toBe("success");
  });

  it("dedupes repeated governmentjobs postings on second run", () => {
    const first = runJobSourceFromRaw(
      governmentJobsSource,
      governmentJobsFixtureHtml,
      [],
      seedResumeModules
    );
    const second = runJobSourceFromRaw(
      governmentJobsSource,
      governmentJobsFixtureHtml,
      first.candidates,
      seedResumeModules
    );
    expect(second.result.createdCandidateIds).toHaveLength(0);
    expect(second.result.skippedDuplicates).toBeGreaterThan(0);
  });

  it("caps governmentjobs output with maxResults", () => {
    const output = runJobSourceFromRaw(
      { ...governmentJobsSource, maxResults: 1 },
      governmentJobsFixtureHtml,
      [],
      seedResumeModules
    );
    expect(output.candidates).toHaveLength(1);
  });

  it("treats empty governmentjobs HTML as weak pass with informative message", () => {
    const output = runJobSourceFromRaw(
      governmentJobsSource,
      "<html><body>Loading...</body></html>",
      [],
      seedResumeModules
    );
    expect(output.candidates).toHaveLength(0);
    expect(output.result.errors).toHaveLength(0);
    expect(output.result.message).toBe(GOVERNMENTJOBS_ZERO_LISTINGS_MESSAGE);
    expect(output.updatedSource.runStatus).toBe("success");
  });

  it("governmentjobs source run does not create application cards", () => {
    const output = runJobSourceFromRaw(
      governmentJobsSource,
      governmentJobsFixtureHtml,
      [],
      seedResumeModules
    );
    const state = createState();
    const result = applyRunJobSourceResult(state, output);
    expect(result.state.cards).toHaveLength(state.cards.length);
  });

  it("creates source_fetch candidates from workday fixture JSON", () => {
    const output = runJobSourceFromRaw(
      workdaySource,
      JSON.parse(workdaySearchJson),
      [],
      seedResumeModules
    );
    expect(output.result.errors).toHaveLength(0);
    expect(output.candidates.length).toBeGreaterThanOrEqual(2);
    expect(output.candidates.every((candidate) => candidate.origin === "source_fetch")).toBe(true);
    expect(output.updatedSource.runStatus).toBe("success");
  });

  it("dedupes repeated workday postings on second run", () => {
    const first = runJobSourceFromRaw(
      workdaySource,
      JSON.parse(workdaySearchJson),
      [],
      seedResumeModules
    );
    const second = runJobSourceFromRaw(
      workdaySource,
      JSON.parse(workdaySearchJson),
      first.candidates,
      seedResumeModules
    );
    expect(second.result.createdCandidateIds).toHaveLength(0);
    expect(second.result.skippedDuplicates).toBeGreaterThan(0);
  });

  it("caps workday output with maxResults", () => {
    const output = runJobSourceFromRaw(
      { ...workdaySource, maxResults: 1 },
      JSON.parse(workdaySearchJson),
      [],
      seedResumeModules
    );
    expect(output.candidates).toHaveLength(1);
  });

  it("treats workday HTML shell as weak pass with informative message", () => {
    const output = runJobSourceFromRaw(
      workdaySource,
      "<html><body>Loading Workday...</body></html>",
      [],
      seedResumeModules
    );
    expect(output.candidates).toHaveLength(0);
    expect(output.result.errors).toHaveLength(0);
    expect(output.result.message).toBe(WORKDAY_ZERO_LISTINGS_MESSAGE);
    expect(output.updatedSource.runStatus).toBe("success");
  });

  it("treats empty workday JSON payload as weak pass", () => {
    const output = runJobSourceFromRaw(
      workdaySource,
      JSON.parse(workdayEmptyJson),
      [],
      seedResumeModules
    );
    expect(output.candidates).toHaveLength(0);
    expect(output.result.errors).toHaveLength(0);
    expect(output.result.message).toBe(WORKDAY_ZERO_LISTINGS_MESSAGE);
    expect(output.updatedSource.runStatus).toBe("success");
  });

  it("workday source run does not create application cards", () => {
    const output = runJobSourceFromRaw(
      workdaySource,
      JSON.parse(workdaySearchJson),
      [],
      seedResumeModules
    );
    const state = createState();
    const result = applyRunJobSourceResult(state, output);
    expect(result.state.cards).toHaveLength(state.cards.length);
  });

  it("creates candidates from workday CXS response fixture", () => {
    const source: JobSource = {
      ...workdaySource,
      url: "/fixtures/sample-workday-cxs-response.json",
      requestConfig: {
        method: "POST",
        bodyJson: { appliedFacets: {}, limit: 20, offset: 0, searchText: "" }
      }
    };
    const output = runJobSourceFromRaw(
      source,
      JSON.parse(workdayCxsResponseJson),
      [],
      seedResumeModules
    );
    expect(output.result.errors).toHaveLength(0);
    expect(output.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects workday source with forbidden credential keys in requestConfig", () => {
    const guard = canRunJobSource({
      ...workdaySource,
      requestConfig: {
        method: "POST",
        bodyJson: { authorization: "Bearer secret", appliedFacets: {} }
      }
    });
    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("authorization");
  });

  it("uses manual-run enabled and scheduled lock thresholds", () => {
    const locks = checkJobScoutLocks([], [], [], []);
    expect(locks.find((lock) => lock.id === "manual-run-fetching")?.enabled).toBe(true);
    expect(locks.find((lock) => lock.id === "scheduled-fetching")?.required).toBe(5);
  });
});

function buildWorkdayPageJson(jobCount: number, offset: number) {
  const jobPostings = Array.from({ length: jobCount }, (_, index) => ({
    title: `Engineer ${offset + index}`,
    externalPath: `/en-US/External/job/Engineer-${offset + index}`,
    locationsText: "Remote"
  }));
  return { total: jobCount, body: { jobPostings } };
}

const paginatedWorkdaySource: JobSource = {
  id: "source-workday-paginated",
  name: "Paginated Workday",
  url: "https://example.com/wday/cxs/example/jobs",
  kind: "workday",
  enabled: true,
  cadence: "manual",
  requestConfig: {
    method: "POST",
    bodyJson: { appliedFacets: {}, limit: 20, offset: 0, searchText: "" },
    pagination: { mode: "workday_offset", limit: 20, maxPages: 3, maxResults: 100 }
  }
};

describe("runPaginatedJobSourceFromRaw", () => {
  it("increments offset 0 → 20 → 40 across pages", async () => {
    const offsets: number[] = [];
    const output = await runPaginatedJobSourceFromRaw(
      paginatedWorkdaySource,
      [],
      seedResumeModules,
      async (pageSource) => {
        const body = pageSource.requestConfig?.bodyJson as { offset?: number };
        offsets.push(body.offset ?? 0);
        return { ok: true, raw: buildWorkdayPageJson(20, body.offset ?? 0) };
      }
    );
    expect(offsets).toEqual([0, 20, 40]);
    expect(output.result.pagesFetched).toBe(3);
    expect(output.result.paginationStoppedReason).toBe("max_pages");
    expect(output.candidates.length).toBeGreaterThan(0);
  });

  it("stops when page returns fewer than limit", async () => {
    const output = await runPaginatedJobSourceFromRaw(
      paginatedWorkdaySource,
      [],
      seedResumeModules,
      async (pageSource) => {
        const body = pageSource.requestConfig?.bodyJson as { offset?: number };
        const offset = body.offset ?? 0;
        const count = offset === 0 ? 20 : 5;
        return { ok: true, raw: buildWorkdayPageJson(count, offset) };
      }
    );
    expect(output.result.pagesFetched).toBe(2);
    expect(output.result.paginationStoppedReason).toBe("fewer_than_limit");
  });

  it("stops at maxPages", async () => {
    const output = await runPaginatedJobSourceFromRaw(
      {
        ...paginatedWorkdaySource,
        requestConfig: {
          ...paginatedWorkdaySource.requestConfig!,
          pagination: { mode: "workday_offset", limit: 20, maxPages: 2, maxResults: 100 }
        }
      },
      [],
      seedResumeModules,
      async (pageSource) => {
        const body = pageSource.requestConfig?.bodyJson as { offset?: number };
        return { ok: true, raw: buildWorkdayPageJson(20, body.offset ?? 0) };
      }
    );
    expect(output.result.pagesFetched).toBe(2);
    expect(output.result.paginationStoppedReason).toBe("max_pages");
  });

  it("respects effectiveMaxResults as a single cap through finalize", async () => {
    const output = await runPaginatedJobSourceFromRaw(
      {
        ...paginatedWorkdaySource,
        requestConfig: {
          ...paginatedWorkdaySource.requestConfig!,
          pagination: { mode: "workday_offset", limit: 20, maxPages: 3, maxResults: 25 }
        }
      },
      [],
      seedResumeModules,
      async (pageSource) => {
        const body = pageSource.requestConfig?.bodyJson as { offset?: number };
        return { ok: true, raw: buildWorkdayPageJson(20, body.offset ?? 0) };
      }
    );
    expect(output.candidates.length).toBeLessThanOrEqual(25);
    expect(output.result.paginationStoppedReason).toBe("max_results");
  });

  it("uses parsed page posting count for stop logic even with duplicate titles", async () => {
    const duplicateHeavyPage = {
      total: 20,
      body: {
        jobPostings: Array.from({ length: 20 }, () => ({
          title: "Same Title",
          externalPath: "/en-US/External/job/same",
          locationsText: "Remote"
        }))
      }
    };
    const output = await runPaginatedJobSourceFromRaw(
      paginatedWorkdaySource,
      [],
      seedResumeModules,
      async (pageSource) => {
        const body = pageSource.requestConfig?.bodyJson as { offset?: number };
        if ((body.offset ?? 0) === 0) {
          return { ok: true, raw: duplicateHeavyPage };
        }
        return { ok: true, raw: buildWorkdayPageJson(0, body.offset ?? 0) };
      }
    );
    expect(output.result.pagesFetched).toBe(2);
    expect(output.result.paginationStoppedReason).toBe("zero_postings");
  });

  it("dedupes duplicates across pages", async () => {
    const sharedJob = {
      title: "Shared Role",
      externalPath: "/en-US/External/job/shared",
      locationsText: "Remote"
    };
    const output = await runPaginatedJobSourceFromRaw(
      paginatedWorkdaySource,
      [],
      seedResumeModules,
      async (pageSource) => {
        const body = pageSource.requestConfig?.bodyJson as { offset?: number };
        const offset = body.offset ?? 0;
        if (offset === 0) {
          return {
            ok: true,
            raw: { total: 1, body: { jobPostings: [sharedJob] } }
          };
        }
        return {
          ok: true,
          raw: { total: 1, body: { jobPostings: [sharedJob, ...buildWorkdayPageJson(19, offset).body.jobPostings] } }
        };
      }
    );
    const titles = output.candidates.map((candidate) => candidate.roleTitle);
    expect(titles.filter((title) => title === "Shared Role")).toHaveLength(1);
  });

  it("does not create application cards", async () => {
    const output = await runPaginatedJobSourceFromRaw(
      paginatedWorkdaySource,
      [],
      seedResumeModules,
      async () => ({ ok: true, raw: buildWorkdayPageJson(2, 0) })
    );
    const state = createState();
    const result = applyRunJobSourceResult(state, output);
    expect(result.state.cards).toHaveLength(state.cards.length);
  });
});

describe("finalizeJobSourceFromPostings", () => {
  it("does not apply a second lower source.maxResults cap when effectiveMaxResults is provided", () => {
    const postings = Array.from({ length: 30 }, (_, index) => ({
      roleTitle: `Role ${index}`,
      company: "Acme",
      sourceUrl: `https://example.com/${index}`,
      description: "desc",
      roleType: "software" as const
    }));
    const output = finalizeJobSourceFromPostings(
      { ...paginatedWorkdaySource, maxResults: 5 },
      postings,
      [],
      seedResumeModules,
      [],
      { effectiveMaxResults: 30 }
    );
    expect(output.candidates).toHaveLength(30);
  });
});
