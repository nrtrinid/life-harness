import { describe, expect, it, vi } from "vitest";

import { runFeatureSprintDeepSeekReview, runMockFeatureSprintDeepSeekReview } from "./featureSprintDeepSeekReviewer";
import { parseFeatureAutomatedReviewVerdictBlock } from "./featureSprintReviewerAdapter";

const REQUEST = {
  cardId: "card-build-test",
  planId: "plan-1",
  stepId: "step-1",
  promptMarkdown: "Implemented core helpers with proof and testsRun npm test."
};

describe("featureSprintDeepSeekReviewer", () => {
  it("mock review returns deterministic accepted verdict for valid proof", async () => {
    const result = await runMockFeatureSprintDeepSeekReview(REQUEST);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.mode).toBe("mock");
    expect(result.verdict.verdict).toBe("accepted");
    expect(parseFeatureAutomatedReviewVerdictBlock(result.outputText)?.verdict).toBe("accepted");
  });

  it("mock review returns needs_changes when proof missing", async () => {
    const result = await runMockFeatureSprintDeepSeekReview({
      ...REQUEST,
      promptMarkdown: "Awaiting implementation summary."
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.verdict.verdict).toBe("needs_changes");
  });

  it("unconfigured returns quiet unavailable result", async () => {
    const result = await runFeatureSprintDeepSeekReview(REQUEST, {
      config: { available: false, mode: "unconfigured", liveSafe: false }
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.mode).toBe("unconfigured");
    expect(result.error).not.toContain("secret");
  });

  it("live adapter uses injected fetch and never exposes api key in errors", async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid key super-secret-key" } })
    }));

    const result = await runFeatureSprintDeepSeekReview(REQUEST, {
      config: {
        available: true,
        mode: "live",
        apiKey: "super-secret-key",
        model: "deepseek-v4-pro",
        baseUrl: "https://api.deepseek.com",
        liveSafe: true
      },
      fetch: fetch as unknown as typeof fetch
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).not.toContain("super-secret-key");
    expect(result.error).toContain("[REDACTED]");
  });

  it("browser live context returns unavailable without network", async () => {
    const fetch = vi.fn();
    const result = await runFeatureSprintDeepSeekReview(REQUEST, {
      env: { DEEPSEEK_API_KEY: "secret-key" },
      runtimeContext: { isBrowserClient: true },
      fetch: fetch as unknown as typeof fetch
    });
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("live adapter parses successful injected response", async () => {
    const verdict = {
      verdict: "accepted",
      confidence: "medium",
      summary: "Looks good.",
      scopeDrift: false,
      missingTests: [],
      riskyChanges: [],
      requiredChanges: [],
      completedSliceItems: ["Slice done"],
      remainingSpecItems: ["Next slice"],
      nextCursorPrompt: "Continue next slice."
    };
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: "```feature-automated-review-verdict\n" + JSON.stringify(verdict) + "\n```"
            }
          }
        ]
      })
    }));

    const result = await runFeatureSprintDeepSeekReview(REQUEST, {
      config: {
        available: true,
        mode: "live",
        apiKey: "test-key",
        model: "deepseek-v4-pro",
        baseUrl: "https://api.deepseek.com",
        liveSafe: true
      },
      fetch: fetch as unknown as typeof fetch
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.verdict.verdict).toBe("accepted");
    const body = JSON.parse((fetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("deepseek-v4-pro");
  });
});
