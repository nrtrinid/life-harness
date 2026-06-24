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
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid key super-secret-key" } })
    }));
    const injectFetchMock = () => fetchMock as unknown as typeof fetch;

    const result = await runFeatureSprintDeepSeekReview(REQUEST, {
      config: {
        available: true,
        mode: "live",
        apiKey: "super-secret-key",
        model: "deepseek-v4-pro",
        baseUrl: "https://api.deepseek.com",
        liveSafe: true
      },
      fetch: injectFetchMock()
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).not.toContain("super-secret-key");
    expect(result.error).toContain("[REDACTED]");
  });

  it("browser live context returns unavailable without network", async () => {
    const fetchMock = vi.fn();
    const injectFetchMock = () => fetchMock as unknown as typeof fetch;

    const result = await runFeatureSprintDeepSeekReview(REQUEST, {
      env: { DEEPSEEK_API_KEY: "secret-key" },
      runtimeContext: { isBrowserClient: true },
      fetch: injectFetchMock()
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
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
    const fetchMock = vi.fn(async () => ({
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
    const injectFetchMock = () => fetchMock as unknown as typeof fetch;
    const readFetchRequestBody = () => {
      const call = fetchMock.mock.calls.at(-1);
      if (!call) {
        throw new Error("Expected fetch to be called");
      }
      const [, init] = call as unknown as [RequestInfo | URL, RequestInit | undefined];
      return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    };

    const result = await runFeatureSprintDeepSeekReview(REQUEST, {
      config: {
        available: true,
        mode: "live",
        apiKey: "test-key",
        model: "deepseek-v4-pro",
        baseUrl: "https://api.deepseek.com",
        liveSafe: true
      },
      fetch: injectFetchMock()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.verdict.verdict).toBe("accepted");
    expect(readFetchRequestBody().model).toBe("deepseek-v4-pro");
  });
});

describe("featureSprintDeepSeekPromptAudit", () => {
  const REQUEST = {
    cardId: "card-build-test",
    promptMarkdown:
      "Implement bounded slice only within listed files. Run npm test verification before save.",
    proposedCursorPrompt:
      "Implement bounded slice only within listed files. Run npm test verification before save."
  };

  it("mock prompt audit returns approved for valid bounded prompt", async () => {
    const { runMockFeatureSprintDeepSeekPromptAudit } = await import("./featureSprintDeepSeekReviewer");
    const result = await runMockFeatureSprintDeepSeekPromptAudit(REQUEST);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.critique.verdict).toBe("approved");
  });

  it("mock prompt audit returns needs_changes when prompt missing", async () => {
    const { runMockFeatureSprintDeepSeekPromptAudit } = await import("./featureSprintDeepSeekReviewer");
    const result = await runMockFeatureSprintDeepSeekPromptAudit({
      cardId: "card-build-test",
      promptMarkdown: "Awaiting worker input."
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.critique.verdict).toBe("needs_changes");
  });

  it("live prompt audit uses promptAuditModel and injected fetch", async () => {
    const { runFeatureSprintDeepSeekPromptAudit } = await import("./featureSprintDeepSeekReviewer");
    const critique = {
      verdict: "approved",
      confidence: "medium",
      summary: "Bounded prompt.",
      scopeDrift: false,
      promptRisks: [],
      missingContext: [],
      missingVerification: [],
      riskyFiles: [],
      requiredPromptEdits: [],
      revisedCursorPrompt: "Implement slice only."
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                "```feature-automated-prompt-critique\n" + JSON.stringify(critique) + "\n```"
            }
          }
        ]
      })
    }));
    const injectFetchMock = () => fetchMock as unknown as typeof fetch;
    const readFetchRequestBody = () => {
      const call = fetchMock.mock.calls.at(-1);
      if (!call) {
        throw new Error("Expected fetch to be called");
      }
      const [, init] = call as unknown as [RequestInfo | URL, RequestInit | undefined];
      return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    };

    const result = await runFeatureSprintDeepSeekPromptAudit(REQUEST, {
      config: {
        available: true,
        mode: "live",
        apiKey: "test-key",
        promptAuditModel: "deepseek-v4-pro",
        baseUrl: "https://api.deepseek.com",
        liveSafe: true
      },
      fetch: injectFetchMock()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(readFetchRequestBody().model).toBe("deepseek-v4-pro");
  });
});
