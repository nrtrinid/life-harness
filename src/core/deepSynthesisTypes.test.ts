import { describe, expect, it } from "vitest";

import {
  parseAiJobStatusResponse,
  parseDeepSynthesisCompletedResult,
  parseDeepSynthesisJobEnqueue,
  parseDeepSynthesisPostResponse,
  parseDeepSynthesisResultBody,
  parseDeepSynthesisSyncQueued
} from "./deepSynthesisTypes";

const groundingRef = {
  kind: "inferred_from_prompt",
  ref: "current_prompt",
  label: "User prompt"
};

export function sampleCompletedWireBody(overrides: Record<string, unknown> = {}) {
  return {
    status: "completed",
    synthesis_id: "syn_test_001",
    pipeline_profile_used: "with_critic",
    degraded_notes: ["Mock fallback used for test."],
    phases_completed: ["draft", "critic"],
    circling: "Build momentum vs career follow-through.",
    strongest_idea: "One tiny outside-world move unlocks the rest.",
    hidden_risk: "Optimizing the board instead of acting.",
    connections: ["Active card pressure mirrors career stall."],
    circling_grounding: [groundingRef],
    strongest_idea_grounding: [groundingRef],
    hidden_risk_grounding: [groundingRef],
    next_pounce: {
      title: "Send one follow-up",
      smallest_action: "Draft a two-sentence check-in email.",
      grounding: groundingRef
    },
    interpretations: [
      {
        lens: "practical",
        summary: "A small external action reduces avoidance.",
        confidence: "medium",
        grounding: [groundingRef]
      }
    ],
    critique: {
      shallow_flags: [],
      missing: [],
      avoidance: [],
      contradictions: [],
      overall: "pass"
    },
    memory_proposals: [
      {
        kind: "pattern",
        text: "Career follow-ups stall when build work heats up.",
        requires_approval: true,
        source_synthesis_id: "syn_test_001"
      }
    ],
    personality_proposals: [],
    confidence_notes: ["Inferred — from thread and board context."],
    safety_notes: ["Read-only synthesis report."],
    ...overrides
  };
}

describe("deepSynthesisTypes parsers", () => {
  it("parses flat completed body", () => {
    const parsed = parseDeepSynthesisCompletedResult(sampleCompletedWireBody());
    expect(parsed.status).toBe("completed");
    expect(parsed.synthesisId).toBe("syn_test_001");
    expect(parsed.circlingGrounding[0]?.label).toBe("User prompt");
    expect(parsed.degradedNotes).toContain("Mock fallback used for test.");
    expect(parsed.memoryProposals[0]?.requiresApproval).toBe(true);
  });

  it("parses sync queued redirect", () => {
    const parsed = parseDeepSynthesisSyncQueued({
      status: "queued",
      job_id: "job_123",
      poll_url: "/ai/jobs/job_123",
      redirect_reason: "critic_required"
    });
    expect(parsed.jobId).toBe("job_123");
    expect(parsed.redirectReason).toBe("critic_required");
  });

  it("parses post response union for completed and queued", () => {
    const completed = parseDeepSynthesisPostResponse(sampleCompletedWireBody());
    expect(completed.status).toBe("completed");

    const queued = parseDeepSynthesisPostResponse({
      status: "queued",
      job_id: "job_abc",
      poll_url: "/ai/jobs/job_abc",
      redirect_reason: "stretch_required"
    });
    expect(queued.status).toBe("queued");
  });

  it("parses job enqueue response", () => {
    const parsed = parseDeepSynthesisJobEnqueue({
      status: "queued",
      job_id: "job_enqueue",
      poll_url: "/ai/jobs/job_enqueue",
      job_kind: "deep_synthesis",
      phase: "queued",
      created_at: "2026-06-10T12:00:00.000Z"
    });
    expect(parsed.jobKind).toBe("deep_synthesis");
    expect(parsed.createdAt).toContain("2026-06-10");
  });

  it("parses completed job poll response result body", () => {
    const parsed = parseAiJobStatusResponse({
      job_id: "job_poll",
      job_kind: "deep_synthesis",
      status: "completed",
      phase: "completed",
      created_at: "2026-06-10T12:00:00.000Z",
      completed_at: "2026-06-10T12:01:00.000Z",
      result: sampleCompletedWireBody({ status: undefined })
    });
    expect(parsed.status).toBe("completed");
    expect(parsed.result?.strongestIdea).toContain("outside-world");
  });

  it("maps result body without status wrapper", () => {
    const parsed = parseDeepSynthesisResultBody(sampleCompletedWireBody({ status: undefined }));
    expect(parsed.synthesisId).toBe("syn_test_001");
    expect(parsed.nextPounce.smallestAction).toContain("email");
  });
});
