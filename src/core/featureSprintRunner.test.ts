import { afterEach, describe, expect, it, vi } from "vitest";

import {
  composeImplementationRunnerOutputSummary,
  FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS,
  FEATURE_SPRINT_RUNNER_MAX_PROMPT_CHARS,
  validateFeatureSprintRunnerRequest
} from "./featureSprintRunner";
import {
  checkFeatureSprintRunnerHealth,
  FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE,
  resolveFeatureSprintRunnerToken,
  runFeatureSprintPacket
} from "./featureSprintRunnerClient";

describe("featureSprintRunner validation", () => {
  it("rejects empty prompt", () => {
    const result = validateFeatureSprintRunnerRequest({
      profile: "codex_scoping",
      promptMarkdown: "   "
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("promptMarkdown");
    }
  });

  it("rejects unknown profile", () => {
    const result = validateFeatureSprintRunnerRequest({
      profile: "codex_builder",
      promptMarkdown: "hello"
    });
    expect(result.ok).toBe(false);
  });

  it("accepts codex_implementation with repoPath and worktree enabled", () => {
    const result = validateFeatureSprintRunnerRequest({
      profile: "codex_implementation",
      promptMarkdown: "implement slice",
      repoPath: "C:/repo/life-harness",
      worktree: { enabled: true }
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.profile).toBe("codex_implementation");
      expect(result.request.repoPath).toBe("C:/repo/life-harness");
      expect(result.request.worktree?.enabled).toBe(true);
    }
  });

  it("rejects implementation profile without repoPath", () => {
    const result = validateFeatureSprintRunnerRequest({
      profile: "codex_implementation",
      promptMarkdown: "implement slice",
      worktree: { enabled: true }
    });
    expect(result).toEqual({
      ok: false,
      error: "codex_implementation requires repoPath."
    });
  });

  it("rejects implementation profile without worktree.enabled", () => {
    const result = validateFeatureSprintRunnerRequest({
      profile: "codex_implementation",
      promptMarkdown: "implement slice",
      repoPath: "C:/repo/life-harness"
    });
    expect(result).toEqual({
      ok: false,
      error: "codex_implementation requires worktree.enabled === true."
    });
  });

  it("applies default timeout", () => {
    const result = validateFeatureSprintRunnerRequest({
      profile: "codex_review",
      promptMarkdown: "review this"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.timeoutMs).toBe(FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS);
    }
  });

  it("enforces max prompt length", () => {
    const result = validateFeatureSprintRunnerRequest({
      profile: "codex_scoping",
      promptMarkdown: "x".repeat(FEATURE_SPRINT_RUNNER_MAX_PROMPT_CHARS + 1)
    });
    expect(result.ok).toBe(false);
  });

  it("normalizes optional fields", () => {
    const result = validateFeatureSprintRunnerRequest({
      profile: "codex_scoping",
      promptMarkdown: "scope",
      cardId: " card-1 ",
      repoPath: ""
    });
    expect(result).toEqual({
      ok: true,
      request: {
        profile: "codex_scoping",
        promptMarkdown: "scope",
        cardId: "card-1",
        timeoutMs: FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS
      }
    });
  });

  it("composes implementation output summary with worktree metadata", () => {
    const summary = composeImplementationRunnerOutputSummary({
      ok: true,
      profile: "codex_implementation",
      outputText: "Implemented slice.",
      startedAt: "2026-06-09T12:00:00.000Z",
      completedAt: "2026-06-09T12:00:05.000Z",
      worktreePath: "/tmp/worktree-a",
      branchName: "life-harness/feature-step-card-1",
      changedFiles: ["src/example.ts"],
      diffStat: " src/example.ts | 2 ++",
      gitStatus: "?? src/example.ts"
    });

    expect(summary).toContain("Implemented slice.");
    expect(summary).toContain("Worktree: /tmp/worktree-a");
    expect(summary).toContain("Changed files (1):");
    expect(summary).toContain("Diff stat:");
  });
});

describe("featureSprintRunnerClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN;
  });

  it("checks runner health via /health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200
      })
    );

    const healthy = await checkFeatureSprintRunnerHealth();
    expect(healthy.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8127/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("reports runner down when health check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const unhealthy = await checkFeatureSprintRunnerHealth();
    expect(unhealthy.ok).toBe(false);
    expect(unhealthy.error).toBe(FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE);
  });

  it("sends Authorization header when token env is set", async () => {
    process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN = "dev-token";
    expect(resolveFeatureSprintRunnerToken()).toBe("dev-token");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        profile: "codex_scoping",
        outputText: "mock",
        startedAt: "2026-06-09T12:00:00.000Z",
        completedAt: "2026-06-09T12:00:01.000Z"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    await runFeatureSprintPacket({
      profile: "codex_scoping",
      promptMarkdown: "scope packet"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8127/feature-sprint/run",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer dev-token"
        })
      })
    );
  });

  it("forwards worktree metadata from runner response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          profile: "codex_implementation",
          outputText: "done",
          startedAt: "2026-06-09T12:00:00.000Z",
          completedAt: "2026-06-09T12:00:01.000Z",
          worktreePath: "/tmp/worktree",
          branchName: "life-harness/feature-step-card",
          changedFiles: ["src/a.ts"],
          diffStat: " src/a.ts | 1 +",
          gitStatus: "?? src/a.ts"
        })
      })
    );

    const result = await runFeatureSprintPacket({
      profile: "codex_implementation",
      promptMarkdown: "implement",
      repoPath: "C:/repo",
      worktree: { enabled: true }
    });

    expect(result.worktreePath).toBe("/tmp/worktree");
    expect(result.changedFiles).toEqual(["src/a.ts"]);
  });

  it("returns graceful failure when runner is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const result = await runFeatureSprintPacket({
      profile: "codex_review",
      promptMarkdown: "review packet"
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe(FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE);
    expect(result.profile).toBe("codex_review");
  });

  it("does not throw on non-200 runner response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Runner failed." })
      })
    );

    const result = await runFeatureSprintPacket({
      profile: "codex_scoping",
      promptMarkdown: "scope packet"
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Runner failed.");
  });
});
