import {
  type FeatureSprintDeepSeekConfig,
  type FeatureSprintDeepSeekEnv,
  type FeatureSprintDeepSeekRuntimeContext,
  FEATURE_SPRINT_DEEPSEEK_DEFAULT_BASE_URL,
  FEATURE_SPRINT_DEEPSEEK_DEFAULT_REVIEW_MODEL,
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
import {
  buildMockAutomatedPromptCritique,
  formatAutomatedPromptCritiqueFence,
  parseFeatureAutomatedPromptCritiqueBlock,
  validateFeatureSprintAutomatedPromptCritique,
  type FeatureSprintAutomatedPromptAuditRequest,
  type FeatureSprintAutomatedPromptAuditResult
} from "./featureSprintPromptAuditAdapter";

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

async function runLiveDeepSeekChatCompletion(
  promptMarkdown: string,
  config: FeatureSprintDeepSeekConfig,
  deps: FeatureSprintDeepSeekReviewDeps,
  options: {
    model: string;
    systemPrompt: string;
    failureLabel: string;
    parseFence: (content: string) => unknown | undefined;
    emptyFenceError: string;
  }
): Promise<
  | { ok: true; content: string; parsed: unknown }
  | { ok: false; error: string; mode: "live" }
> {
  if (!config.liveSafe || !config.apiKey) {
    return {
      ok: false,
      error: `DeepSeek live ${options.failureLabel} is unavailable in this runtime.`,
      mode: "live"
    };
  }

  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    return { ok: false, error: `Fetch is unavailable for DeepSeek ${options.failureLabel}.`, mode: "live" };
  }

  const baseUrl = (config.baseUrl ?? FEATURE_SPRINT_DEEPSEEK_DEFAULT_BASE_URL).replace(/\/$/, "");
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
        model: options.model,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: promptMarkdown }
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
        body.error?.message ?? `DeepSeek ${options.failureLabel} failed with status ${response.status}.`,
        config.apiKey
      );
      return { ok: false, error: message, mode: "live" };
    }

    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: `DeepSeek ${options.failureLabel} returned empty content.`, mode: "live" };
    }

    const parsed = options.parseFence(content);
    if (!parsed) {
      return { ok: false, error: options.emptyFenceError, mode: "live" };
    }

    return { ok: true, content, parsed };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `DeepSeek ${options.failureLabel} request failed.`;
    return {
      ok: false,
      error: sanitizeErrorMessage(message, config.apiKey),
      mode: "live"
    };
  } finally {
    clearTimeout(timer);
  }
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
  const model = config.reviewModel ?? config.model ?? FEATURE_SPRINT_DEEPSEEK_DEFAULT_REVIEW_MODEL;
  const live = await runLiveDeepSeekChatCompletion(request.promptMarkdown, config, deps, {
    model,
    systemPrompt:
      "You are a read-only Feature Sprint reviewer. Return only the requested fenced JSON verdict.",
    failureLabel: "review",
    parseFence: parseFeatureAutomatedReviewVerdictBlock,
    emptyFenceError: "DeepSeek review returned no valid automated verdict fence."
  });

  if (!live.ok) {
    return live;
  }

  const verdict = live.parsed as ReturnType<typeof parseFeatureAutomatedReviewVerdictBlock>;
  const validation = validateFeatureSprintAutomatedReviewVerdict(verdict!);
  if (!validation.ok) {
    return { ok: false, error: validation.error, mode: "live" };
  }

  return {
    ok: true,
    outputText: formatAutomatedReviewVerdictFence(verdict!),
    verdict: verdict!,
    mode: "live"
  };
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

export async function runMockFeatureSprintDeepSeekPromptAudit(
  request: FeatureSprintAutomatedPromptAuditRequest
): Promise<FeatureSprintAutomatedPromptAuditResult> {
  const critique = buildMockAutomatedPromptCritique(request);
  const validation = validateFeatureSprintAutomatedPromptCritique(critique);
  if (!validation.ok) {
    return { ok: false, error: validation.error, mode: "mock" };
  }

  return {
    ok: true,
    outputText: formatAutomatedPromptCritiqueFence(critique),
    critique,
    mode: "mock"
  };
}

async function runLiveFeatureSprintDeepSeekPromptAudit(
  request: FeatureSprintAutomatedPromptAuditRequest,
  config: FeatureSprintDeepSeekConfig,
  deps: FeatureSprintDeepSeekReviewDeps
): Promise<FeatureSprintAutomatedPromptAuditResult> {
  const model =
    config.promptAuditModel ?? config.reviewModel ?? config.model ?? FEATURE_SPRINT_DEEPSEEK_DEFAULT_REVIEW_MODEL;
  const live = await runLiveDeepSeekChatCompletion(request.promptMarkdown, config, deps, {
    model,
    systemPrompt:
      "You are a read-only Feature Sprint prompt auditor. Return only the requested fenced JSON critique.",
    failureLabel: "prompt audit",
    parseFence: parseFeatureAutomatedPromptCritiqueBlock,
    emptyFenceError: "DeepSeek prompt audit returned no valid automated critique fence."
  });

  if (!live.ok) {
    return live;
  }

  const critique = live.parsed as ReturnType<typeof parseFeatureAutomatedPromptCritiqueBlock>;
  const validation = validateFeatureSprintAutomatedPromptCritique(critique!);
  if (!validation.ok) {
    return { ok: false, error: validation.error, mode: "live" };
  }

  return {
    ok: true,
    outputText: formatAutomatedPromptCritiqueFence(critique!),
    critique: critique!,
    mode: "live"
  };
}

export async function runFeatureSprintDeepSeekPromptAudit(
  request: FeatureSprintAutomatedPromptAuditRequest,
  deps: FeatureSprintDeepSeekReviewDeps = {}
): Promise<FeatureSprintAutomatedPromptAuditResult> {
  const config =
    deps.config ??
    resolveFeatureSprintDeepSeekConfig(deps.env, deps.runtimeContext);

  if (config.mode === "mock") {
    return runMockFeatureSprintDeepSeekPromptAudit(request);
  }

  if (config.mode === "unconfigured" || !config.available) {
    return {
      ok: false,
      error: "DeepSeek reviewer not configured.",
      mode: "unconfigured"
    };
  }

  return runLiveFeatureSprintDeepSeekPromptAudit(request, config, deps);
}
