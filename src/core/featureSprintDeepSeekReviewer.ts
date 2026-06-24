import {
  type FeatureSprintDeepSeekConfig,
  type FeatureSprintDeepSeekEnv,
  type FeatureSprintDeepSeekRuntimeContext,
  FEATURE_SPRINT_DEEPSEEK_DEFAULT_BASE_URL,
  resolveFeatureSprintDeepSeekConfig
} from "./featureSprintDeepSeekConfig";
import {
  buildMockAutomatedReviewVerdict,
  formatAutomatedReviewVerdictFence,
  parseFeatureAutomatedReviewVerdictBlock,
  validateFeatureSprintAutomatedReviewVerdict,
  type FeatureSprintAutomatedReviewRequest,
  type FeatureSprintAutomatedReviewResult
} from "./featureSprintReviewerAdapter";

export const FEATURE_SPRINT_DEEPSEEK_DEFAULT_TIMEOUT_MS = 120_000;

export type FeatureSprintDeepSeekReviewDeps = {
  fetch?: typeof fetch;
  config?: FeatureSprintDeepSeekConfig;
  env?: FeatureSprintDeepSeekEnv;
  runtimeContext?: FeatureSprintDeepSeekRuntimeContext;
  timeoutMs?: number;
};

function sanitizeErrorMessage(message: string, apiKey?: string): string {
  if (!apiKey) {
    return message;
  }
  return message.split(apiKey).join("[REDACTED]");
}

export async function runMockFeatureSprintDeepSeekReview(
  request: FeatureSprintAutomatedReviewRequest
): Promise<FeatureSprintAutomatedReviewResult> {
  const verdict = buildMockAutomatedReviewVerdict(request);
  const validation = validateFeatureSprintAutomatedReviewVerdict(verdict);
  if (!validation.ok) {
    return { ok: false, error: validation.error, mode: "mock" };
  }

  const outputText = formatAutomatedReviewVerdictFence(verdict);
  return { ok: true, outputText, verdict, mode: "mock" };
}

async function runLiveFeatureSprintDeepSeekReview(
  request: FeatureSprintAutomatedReviewRequest,
  config: FeatureSprintDeepSeekConfig,
  deps: FeatureSprintDeepSeekReviewDeps
): Promise<FeatureSprintAutomatedReviewResult> {
  if (!config.liveSafe || !config.apiKey) {
    return {
      ok: false,
      error: "DeepSeek live review is unavailable in this runtime.",
      mode: "live"
    };
  }

  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    return { ok: false, error: "Fetch is unavailable for DeepSeek review.", mode: "live" };
  }

  const baseUrl = (config.baseUrl ?? FEATURE_SPRINT_DEEPSEEK_DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = config.model ?? "deepseek-v4-pro";
  const timeoutMs = deps.timeoutMs ?? FEATURE_SPRINT_DEEPSEEK_DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a read-only Feature Sprint reviewer. Return only the requested fenced JSON verdict."
          },
          { role: "user", content: request.promptMarkdown }
        ],
        temperature: 0.2
      }),
      signal: controller.signal
    });

    const body = (await response.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      const message = sanitizeErrorMessage(
        body.error?.message ?? `DeepSeek review failed with status ${response.status}.`,
        config.apiKey
      );
      return { ok: false, error: message, mode: "live" };
    }

    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: "DeepSeek review returned empty content.", mode: "live" };
    }

    const verdict = parseFeatureAutomatedReviewVerdictBlock(content);
    if (!verdict) {
      return { ok: false, error: "DeepSeek review returned no valid automated verdict fence.", mode: "live" };
    }

    const validation = validateFeatureSprintAutomatedReviewVerdict(verdict);
    if (!validation.ok) {
      return { ok: false, error: validation.error, mode: "live" };
    }

    return {
      ok: true,
      outputText: formatAutomatedReviewVerdictFence(verdict),
      verdict,
      mode: "live"
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "DeepSeek review request failed.";
    return {
      ok: false,
      error: sanitizeErrorMessage(message, config.apiKey),
      mode: "live"
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runFeatureSprintDeepSeekReview(
  request: FeatureSprintAutomatedReviewRequest,
  deps: FeatureSprintDeepSeekReviewDeps = {}
): Promise<FeatureSprintAutomatedReviewResult> {
  const config =
    deps.config ??
    resolveFeatureSprintDeepSeekConfig(deps.env, deps.runtimeContext);

  if (config.mode === "mock") {
    return runMockFeatureSprintDeepSeekReview(request);
  }

  if (config.mode === "unconfigured" || !config.available) {
    return {
      ok: false,
      error: "DeepSeek reviewer not configured.",
      mode: "unconfigured"
    };
  }

  return runLiveFeatureSprintDeepSeekReview(request, config, deps);
}
