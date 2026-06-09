import { describe, expect, it } from "vitest";

import {
  applyApproveJobCandidate,
  applyCardStateChange,
  applyCareerIntake,
  applyDismissJobCandidate,
  applyJobCandidateIntake,
  applyMvd,
  applyPounce,
  applyQuickCapture,
  applyRunJobSourceResult,
  applySalvage,
  applySaveJobCandidate,
  type LifeHarnessData
} from "./actions";
import { runJobSourceFromRaw } from "./jobSourceRunner";
import { seedJobCandidates, seedJobSources, seedResumeModules } from "../data/seedJobScout";
import { seedCards, seedDailyState, seedLogs, seedProofItems } from "../data/seed";
import type { DailyState } from "./types";

function createState(dailyStateOverrides: Partial<DailyState> = {}): LifeHarnessData {
  return {
    cards: structuredClone(seedCards),
    logs: structuredClone(seedLogs),
    proofItems: structuredClone(seedProofItems),
    dailyState: { ...structuredClone(seedDailyState), ...dailyStateOverrides },
    resumeModules: structuredClone(seedResumeModules),
    jobCandidates: structuredClone(seedJobCandidates),
    jobSources: structuredClone(seedJobSources),
    jobSourceRuns: []
  };
}

describe("applyPounce", () => {
  it("rejects a second pounce in the same session", () => {
    const state = createState({ pounceStarted: true });
    const result = applyPounce(state);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("already logged");
    expect(result.state.logs).toHaveLength(state.logs.length);
  });

  it("creates career pounce log and proof on first pounce", () => {
    const state = createState({ pounceStarted: false });
    const result = applyPounce(state);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Career pounce");
    expect(result.state.logs[0]?.area).toBe("social_career");
    expect(result.state.proofItems[0]?.title).toBe("Started career pounce");
    expect(result.state.dailyState.pounceStarted).toBe(true);
  });
});

describe("applyCardStateChange", () => {
  it("creates log and proof when parking via state button", () => {
    const state = createState();
    const activeCard = state.cards.find((card) => card.state === "active");
    expect(activeCard).toBeDefined();

    const result = applyCardStateChange(state, activeCard!.id, "parked");

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Parked");
    expect(result.message).toContain("Proof updated");
    expect(result.state.logs.length).toBe(state.logs.length + 1);
    expect(result.state.proofItems.length).toBe(state.proofItems.length + 1);
    expect(result.state.cards.find((card) => card.id === activeCard!.id)?.state).toBe("parked");
  });

  it("syncs applicationStatus when changing application card state", () => {
    const state = createState();
    const application = state.cards.find((card) => card.id === "qualcomm-application");
    expect(application?.careerApplication).toBeDefined();

    const result = applyCardStateChange(state, application!.id, "done");

    expect(result.ok).toBe(true);
    const updated = result.state.cards.find((card) => card.id === application!.id);
    expect(updated?.state).toBe("done");
    expect(updated?.careerApplication?.applicationStatus).toBe("done");
  });
});

describe("applyMvd", () => {
  it("rejects a second MVD in the same session", () => {
    const state = createState({ minimumViableDayCompleted: true });
    const result = applyMvd(state);

    expect(result.ok).toBe(false);
    expect(result.state.logs).toHaveLength(state.logs.length);
  });
});

describe("applySalvage", () => {
  it("rejects a second salvage in the same session", () => {
    const state = createState({ salvageCompleted: true });
    const result = applySalvage(state, "10-minute walk");

    expect(result.ok).toBe(false);
    expect(result.state.logs).toHaveLength(state.logs.length);
  });
});

describe("applyCareerIntake", () => {
  it("defaults new application cards to inbox", () => {
    const state = createState();
    const result = applyCareerIntake(state, {
      company: "Acme",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software"
    });

    expect(result.ok).toBe(true);
    const card = result.state.cards[0];
    expect(card.state).toBe("inbox");
    expect(card.careerApplication?.applicationStatus).toBe("inbox");
    expect(result.state.proofItems[0]?.title).toBe("Created application card");
  });

  it("blocks active intake when active limit is full", () => {
    const state = createState();
    const result = applyCareerIntake(state, {
      company: "Blocked Co",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software",
      applicationStatus: "active"
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Active is full");
  });
});

describe("applyQuickCapture", () => {
  it("creates exactly one log on a matched win", () => {
    const state = createState();
    const result = applyQuickCapture(state, "worked on rpg");

    expect(result.ok).toBe(true);
    expect(result.state.logs.length).toBe(state.logs.length + 1);
  });

  it("creates applied proof for applied capture", () => {
    const state = createState();
    const result = applyQuickCapture(state, "applied to Acme job");

    expect(result.ok).toBe(true);
    expect(result.state.proofItems[0]?.title).toBe("Applied to job");
  });
});

describe("job candidate actions", () => {
  it("creates candidate without application card", () => {
    const state = createState();
    const result = applyJobCandidateIntake(state, {
      company: "Test Co",
      roleTitle: "Engineer",
      description: "Python and security experience required.",
      roleType: "software",
      origin: "manual"
    });

    expect(result.ok).toBe(true);
    expect(result.state.jobCandidates.length).toBe(state.jobCandidates.length + 1);
    expect(result.state.cards.length).toBe(state.cards.length);
    expect(result.state.jobCandidates[0]?.origin).toBe("manual");
  });

  it("approves candidate into inbox with bidirectional links", () => {
    const state = createState();
    const intake = applyJobCandidateIntake(state, {
      company: "Approve Co",
      roleTitle: "Security Engineer",
      description: "Python, TypeScript, security, application security.",
      roleType: "cybersecurity",
      origin: "manual"
    });
    const candidateId = intake.candidateId!;

    const approved = applyApproveJobCandidate(intake.state, candidateId);
    expect(approved.ok).toBe(true);
    const card = approved.state.cards[0];
    const candidate = approved.state.jobCandidates.find((item) => item.id === candidateId);

    expect(card?.state).toBe("inbox");
    expect(candidate?.status).toBe("card_created");
    expect(candidate?.applicationCardId).toBe(card?.id);
    expect(card?.careerApplication?.jobCandidateId).toBe(candidateId);
  });

  it("is idempotent when approving again", () => {
    const state = createState();
    const intake = applyJobCandidateIntake(state, {
      company: "Approve Co",
      roleTitle: "Security Engineer",
      description: "Python and security.",
      roleType: "cybersecurity",
      origin: "manual"
    });
    const candidateId = intake.candidateId!;
    const first = applyApproveJobCandidate(intake.state, candidateId);
    const second = applyApproveJobCandidate(first.state, candidateId);

    expect(second.ok).toBe(true);
    expect(second.message).toContain("Already approved");
    expect(second.state.cards.length).toBe(first.state.cards.length);
  });

  it("supports save and dismiss transitions", () => {
    const state = createState();
    const intake = applyJobCandidateIntake(state, {
      company: "Queue Co",
      roleTitle: "Engineer",
      description: "Python",
      roleType: "software",
      origin: "manual"
    });
    const candidateId = intake.candidateId!;

    const saved = applySaveJobCandidate(intake.state, candidateId);
    expect(saved.state.jobCandidates.find((item) => item.id === candidateId)?.status).toBe("saved");

    const dismissed = applyDismissJobCandidate(saved.state, candidateId);
    expect(dismissed.state.jobCandidates.find((item) => item.id === candidateId)?.status).toBe(
      "dismissed"
    );
  });

  it("records source run candidates with source_fetch origin", () => {
    const state = createState();
    const source = state.jobSources.find((item) => item.id === "source-fixture-greenhouse");
    expect(source).toBeDefined();
    const output = runJobSourceFromRaw(
      source!,
      {
        jobs: [
          {
            title: "Platform Engineer",
            absolute_url: "https://boards.example.com/jobs/2001",
            content: "TypeScript React testing software engineer."
          }
        ]
      },
      state.jobCandidates,
      state.resumeModules
    );
    const result = applyRunJobSourceResult(state, output);
    expect(result.ok).toBe(true);
    expect(result.state.jobCandidates[0]?.origin).toBe("source_fetch");
    expect(result.state.jobSourceRuns).toHaveLength(1);
    expect(result.state.cards).toHaveLength(state.cards.length);
  });
});
