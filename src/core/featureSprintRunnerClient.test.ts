import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE,
  runFeatureSprintPacket
} from "./featureSprintRunnerClient";
import type { FeatureSprintRunnerResponse } from "./featureSprintRunner";

function baseRequest() {
  return {
    profile: "cursor_scoping" as const,
    promptMarkdown: "## smoke\n\nSay hello."
  };
}

describe("runFeatureSprintPacket structured envelopes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves HTTP 500 empty_output envelope fields", async () => {
    const envelope: FeatureSprintRunnerResponse = {
      ok: false,
      profile: "cursor_scoping",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      exitCode: 0,
      runId: "run-empty-1",
      provider: "cursor",
      runnerMode: "cursor",
      terminationReason: "completed",
      failureClass: "empty_output",
      resultUsability: "empty_output",
      timedOut: false,
      cancelled: false,
      stdoutText: "",
      stderrText: "",
      parseWarnings: ["empty stdout"],
      diagnosticMessage: "Completed with empty captured output.",
      changedFiles: [],
      error: "Cursor completed with empty captured output."
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => envelope
      })
    );

    const result = await runFeatureSprintPacket(baseRequest());
    expect(result.ok).toBe(false);
    expect(result.failureClass).toBe("empty_output");
    expect(result.resultUsability).toBe("empty_output");
    expect(result.terminationReason).toBe("completed");
    expect(result.runId).toBe("run-empty-1");
    expect(result.provider).toBe("cursor");
    expect(result.runnerMode).toBe("cursor");
    expect(result.diagnosticMessage).toBe("Completed with empty captured output.");
    expect(result.parseWarnings).toEqual(["empty stdout"]);
  });

  it("preserves HTTP 500 readonly_mutation envelope fields", async () => {
    const envelope: FeatureSprintRunnerResponse = {
      ok: false,
      profile: "cursor_scoping",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:02.000Z",
      runId: "run-ro-1",
      provider: "cursor",
      runnerMode: "cursor",
      terminationReason: "completed",
      failureClass: "runner",
      resultUsability: "needs_human_review",
      timedOut: false,
      cancelled: false,
      changedFiles: ["README.md"],
      gitStatus: " M README.md",
      diagnosticMessage: "Read-only phase wrote to the worktree.",
      error: "readonly_mutation"
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => envelope
      })
    );

    const result = await runFeatureSprintPacket(baseRequest());
    expect(result.ok).toBe(false);
    expect(result.resultUsability).toBe("needs_human_review");
    expect(result.changedFiles).toEqual(["README.md"]);
    expect(result.gitStatus).toBe(" M README.md");
    expect(result.runId).toBe("run-ro-1");
    expect(result.diagnosticMessage).toContain("Read-only");
  });

  it("falls back when HTTP 500 body is invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        }
      })
    );

    const result = await runFeatureSprintPacket(baseRequest());
    expect(result.ok).toBe(false);
    expect(result.failureClass).toBeUndefined();
    expect(result.error).toBe("Runner returned an unreadable response body.");
  });

  it("falls back on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const result = await runFeatureSprintPacket(baseRequest());
    expect(result.ok).toBe(false);
    expect(result.error).toBe(FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE);
    expect(result.failureClass).toBeUndefined();
  });

  it("maps a successful 200 response with envelope fields", async () => {
    const envelope: FeatureSprintRunnerResponse = {
      ok: true,
      profile: "cursor_scoping",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.500Z",
      outputText: "plan ok",
      exitCode: 0,
      runId: "run-ok-1",
      provider: "cursor",
      runnerMode: "cursor",
      terminationReason: "completed",
      failureClass: "none",
      resultUsability: "usable",
      timedOut: false,
      cancelled: false,
      commandPreview: "agent -p ..."
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => envelope
      })
    );

    const result = await runFeatureSprintPacket(baseRequest());
    expect(result.ok).toBe(true);
    expect(result.outputText).toBe("plan ok");
    expect(result.runId).toBe("run-ok-1");
    expect(result.failureClass).toBe("none");
    expect(result.resultUsability).toBe("usable");
  });

  it("does not convert structured ok:false into success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          ok: false,
          profile: "cursor_scoping",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
          failureClass: "empty_output",
          resultUsability: "empty_output"
        })
      })
    );

    const result = await runFeatureSprintPacket(baseRequest());
    expect(result.ok).toBe(false);
  });
});
