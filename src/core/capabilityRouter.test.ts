import { describe, expect, it } from "vitest";

import {
  formatCapabilityRoutingSummary,
  isAssistantActionAllowed,
  routeCapabilities,
  routingToToolPermissions
} from "./capabilityRouter";

describe("routeCapabilities", () => {
  it("routes career tailoring without sprint or runner capabilities", () => {
    const result = routeCapabilities({
      route: "companion",
      message: "Tailor my resume for this job post",
      mode: "general",
      sensitivity: "S1"
    });

    expect(result.intent).toBe("career_tailor");
    expect(result.groups.some((group) => group.id === "career_tailor")).toBe(true);
    expect(result.allowed).toContain("resume_bank");
    expect(result.allowed).not.toContain("feature_sprint");
    expect(result.allowed).not.toContain("runner_health");
    expect(result.denied).toContain("feature_sprint");
  });

  it("routes feature sprint without resume bank capabilities", () => {
    const result = routeCapabilities({
      route: "companion",
      message: "Run the next feature sprint step in the worktree",
      mode: "operator",
      sensitivity: "S1"
    });

    expect(result.intent).toBe("feature_sprint");
    expect(result.allowed).toContain("feature_sprint");
    expect(result.allowed).toContain("create_agent_session");
    expect(result.allowed).not.toContain("resume_bank");
    expect(result.denied).toContain("resume_bank");
  });

  it("keeps next-move requests on the always-on set", () => {
    const result = routeCapabilities({
      route: "companion",
      message: "What should I do next?",
      mode: "operator",
      sensitivity: "S1"
    });

    expect(result.intent).toBe("next_move");
    expect(result.groups).toHaveLength(0);
    expect(result.allowed).toContain("read_board");
    expect(result.allowed).not.toContain("career_pack");
    expect(result.allowed).not.toContain("feature_sprint");
    expect(result.denied).toContain("create_agent_session");
  });

  it("returns empty capabilities for raw lab route", () => {
    const result = routeCapabilities({
      route: "raw_lab",
      message: "anything",
      mode: "general",
      sensitivity: "S1"
    });

    expect(result.allowed).toHaveLength(0);
    expect(result.notes[0]).toContain("raw_lab");
  });

  it("flags pasted job-like content as untrusted", () => {
    const pastedJob = `Job description:\n${"Must have 5 years experience. ".repeat(20)}`;
    const result = routeCapabilities({
      route: "companion",
      message: pastedJob,
      mode: "general",
      sensitivity: "S1"
    });

    expect(result.untrustedHints.length).toBeGreaterThan(0);
    expect(result.untrustedHints[0]?.sourceKind).toBe("job_post");
  });

  it("blocks all capabilities at S3 sensitivity", () => {
    const result = routeCapabilities({
      route: "companion",
      message: "Tailor my resume",
      mode: "general",
      sensitivity: "S3"
    });

    expect(result.allowed).toHaveLength(0);
    expect(result.notes.some((note) => note.includes("S3 sensitivity"))).toBe(true);
  });

  it("allows create_agent_session in builder mode", () => {
    const result = routeCapabilities({
      route: "companion",
      message: "Help me implement this slice",
      mode: "builder",
      sensitivity: "S1"
    });

    expect(result.allowed).toContain("create_agent_session");
    expect(result.groups.some((group) => group.id === "builder_mode")).toBe(true);
  });

  it("adds deep synthesis group on deep synthesis route", () => {
    const result = routeCapabilities({
      route: "deep_synthesis",
      message: "What were we circling?",
      mode: "reflection",
      sensitivity: "S1"
    });

    expect(result.groups.some((group) => group.id === "deep_synthesis")).toBe(true);
    expect(result.allowed).toContain("deep_synthesis");
  });
});

describe("routing helpers", () => {
  it("maps wire tool permissions without unimplemented propose-only caps", () => {
    const result = routeCapabilities({
      route: "companion",
      message: "What should I do next?",
      mode: "general",
      sensitivity: "S1"
    });
    const mapped = routingToToolPermissions(result);

    expect(mapped.allowed).not.toContain("propose_card_update");
    expect(mapped.allowed).not.toContain("navigate_route");
    expect(mapped.allowed).toContain("read_board");
  });

  it("formats a compact routing summary", () => {
    const result = routeCapabilities({
      route: "companion",
      message: "Tailor my resume",
      mode: "general",
      sensitivity: "S1"
    });

    expect(formatCapabilityRoutingSummary(result)).toContain("career_tailor");
  });

  it("blocks create_agent_session for next-move intent", () => {
    const result = routeCapabilities({
      route: "companion",
      message: "What should I do next?",
      mode: "operator",
      sensitivity: "S1"
    });

    expect(isAssistantActionAllowed("create_agent_session", result)).toBe(false);
    expect(isAssistantActionAllowed("quick_capture", result)).toBe(true);
  });
});
