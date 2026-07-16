import { describe, expect, it } from "vitest";

import { buildRunnerResult } from "../src/resultEnvelope";
import { assessCompletedRunUsability } from "../src/resultUsability";
import { normalizeAgentCapturedOutput, stripAnsi } from "../src/outputNormalize";
import { redactSecrets } from "../src/redact";

describe("assessCompletedRunUsability", () => {
  it("rejects empty and whitespace-only output for scoping", () => {
    const empty = assessCompletedRunUsability({
      profile: "cursor_scoping",
      outputText: ""
    });
    expect(empty.ok).toBe(false);
    expect(empty.failureClass).toBe("empty_output");
    expect(empty.resultUsability).toBe("empty_output");

    const ws = assessCompletedRunUsability({
      profile: "codex_review",
      outputText: "  \n\t  "
    });
    expect(ws.ok).toBe(false);
    expect(ws.failureClass).toBe("empty_output");
  });

  it("accepts nonempty scoping output", () => {
    const result = assessCompletedRunUsability({
      profile: "cursor_scoping",
      outputText: "```feature-sprint-plan\n{}\n```"
    });
    expect(result.ok).toBe(true);
    expect(result.resultUsability).toBe("usable");
    expect(result.failureClass).toBe("none");
  });

  it("allows implementation sparse text when worktree has changes", () => {
    const result = assessCompletedRunUsability({
      profile: "cursor_implementation",
      outputText: "",
      changedFiles: [".life-harness/smoke-result.md"]
    });
    expect(result.ok).toBe(true);
    expect(result.resultUsability).toBe("usable");
    expect(result.parseWarnings.some((w) => w.includes("worktree"))).toBe(true);
  });

  it("rejects implementation with empty text and no changes", () => {
    const result = assessCompletedRunUsability({
      profile: "codex_implementation",
      outputText: "",
      changedFiles: []
    });
    expect(result.ok).toBe(false);
    expect(result.failureClass).toBe("empty_output");
  });
});

describe("buildRunnerResult contradiction guard", () => {
  it("never returns ok=true with empty_output", () => {
    const result = buildRunnerResult({
      ok: true,
      profile: "cursor_scoping",
      runnerMode: "cursor",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      terminationReason: "completed",
      failureClass: "empty_output",
      resultUsability: "empty_output",
      outputText: undefined
    });
    expect(result.ok).toBe(false);
    expect(result.failureClass).toBe("empty_output");
    expect(result.resultUsability).toBe("empty_output");
    expect(result.terminationReason).toBe("completed");
  });

  it("marks completed usable runs as ok", () => {
    const result = buildRunnerResult({
      ok: true,
      profile: "cursor_scoping",
      runnerMode: "cursor",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      terminationReason: "completed",
      outputText: "hello",
      resultUsability: "usable"
    });
    expect(result.ok).toBe(true);
    expect(result.failureClass).toBe("none");
    expect(result.resultUsability).toBe("usable");
  });

  it("echoes opaque executionContext without interpreting it", () => {
    const ctx = { mapNodeId: "story-1", opaque: true };
    const result = buildRunnerResult({
      ok: true,
      profile: "codex_scoping",
      runnerMode: "mock",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      terminationReason: "completed",
      outputText: "plan",
      executionContext: ctx
    });
    expect(result.executionContext).toEqual(ctx);
  });
});

describe("normalizeAgentCapturedOutput", () => {
  it("strips ANSI and unwraps JSON result field", () => {
    expect(stripAnsi("\u001b[32mhi\u001b[0m")).toBe("hi");
    const json = normalizeAgentCapturedOutput(
      JSON.stringify({ type: "result", result: "SMOKE_OK" }),
      "",
      "json"
    );
    expect(json.text).toBe("SMOKE_OK");
    expect(json.format).toBe("json");
  });

  it("keeps raw text for default format", () => {
    const text = normalizeAgentCapturedOutput("line one\nline two", "", "text");
    expect(text.text).toContain("line one");
    expect(text.format).toBe("text");
  });
});

describe("redactSecrets diagnostic boundaries", () => {
  it("redacts token assignments in stderr-like diagnostics but keeps prose", () => {
    const env = {
      CURSOR_API_KEY: "sk-secret-value-abc",
      FEATURE_SPRINT_RUNNER_TOKEN: "runner-token-xyz"
    };
    const stderr =
      "Agent said hello. CURSOR_API_KEY=sk-secret-value-abc Authorization: Bearer runner-token-xyz";
    const redacted = redactSecrets(stderr, env);
    expect(redacted).toContain("Agent said hello");
    expect(redacted).not.toContain("sk-secret-value-abc");
    expect(redacted).not.toContain("runner-token-xyz");
    expect(redacted).toContain("[redacted");
  });

  it("redacts secrets inside structured failed envelopes", () => {
    const previousCursor = process.env.CURSOR_API_KEY;
    const previousToken = process.env.FEATURE_SPRINT_RUNNER_TOKEN;
    process.env.CURSOR_API_KEY = "sk-envelope-secret-key";
    process.env.FEATURE_SPRINT_RUNNER_TOKEN = "envelope-runner-token";

    try {
      const failed = buildRunnerResult({
        ok: false,
        profile: "cursor_scoping",
        runnerMode: "cursor",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        terminationReason: "completed",
        failureClass: "empty_output",
        resultUsability: "empty_output",
        stdoutText: "note CURSOR_API_KEY=sk-envelope-secret-key",
        stderrText: "Authorization: Bearer envelope-runner-token",
        diagnosticMessage: "FEATURE_SPRINT_RUNNER_TOKEN=envelope-runner-token seen",
        error: "Bearer envelope-runner-token rejected"
      });

      const serialized = JSON.stringify(failed);
      expect(serialized).not.toContain("sk-envelope-secret-key");
      expect(serialized).not.toContain("envelope-runner-token");
      expect(failed.ok).toBe(false);
      expect(failed.failureClass).toBe("empty_output");
    } finally {
      if (previousCursor === undefined) {
        delete process.env.CURSOR_API_KEY;
      } else {
        process.env.CURSOR_API_KEY = previousCursor;
      }
      if (previousToken === undefined) {
        delete process.env.FEATURE_SPRINT_RUNNER_TOKEN;
      } else {
        process.env.FEATURE_SPRINT_RUNNER_TOKEN = previousToken;
      }
    }
  });
});
