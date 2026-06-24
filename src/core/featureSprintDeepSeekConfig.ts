export const FEATURE_SPRINT_DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
export const FEATURE_SPRINT_DEEPSEEK_DEFAULT_REVIEW_MODEL = "deepseek-v4-pro";
export const FEATURE_SPRINT_DEEPSEEK_DEFAULT_FLASH_MODEL = "deepseek-v4-flash";

export type FeatureSprintDeepSeekMode = "live" | "mock" | "unconfigured";

export type FeatureSprintDeepSeekRuntimeContext = {
  isBrowserClient?: boolean;
};

export type FeatureSprintDeepSeekEnv = Record<string, string | undefined>;

export type FeatureSprintDeepSeekConfig = {
  available: boolean;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  mode: FeatureSprintDeepSeekMode;
  devOnlyPublicKey?: boolean;
  liveSafe?: boolean;
};

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isTruthyEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function resolveFeatureSprintDeepSeekReviewModel(
  env: FeatureSprintDeepSeekEnv = process.env as FeatureSprintDeepSeekEnv
): string {
  return cleanOptional(env.DEEPSEEK_MODEL) ?? FEATURE_SPRINT_DEEPSEEK_DEFAULT_REVIEW_MODEL;
}

export function resolveFeatureSprintDeepSeekConfig(
  env: FeatureSprintDeepSeekEnv = process.env as FeatureSprintDeepSeekEnv,
  context: FeatureSprintDeepSeekRuntimeContext = {}
): FeatureSprintDeepSeekConfig {
  const baseUrl = cleanOptional(env.DEEPSEEK_BASE_URL) ?? FEATURE_SPRINT_DEEPSEEK_DEFAULT_BASE_URL;
  const model = resolveFeatureSprintDeepSeekReviewModel(env);

  if (
    isTruthyEnv(env.DEEPSEEK_MOCK) ||
    env.FEATURE_SPRINT_DEEPSEEK_MODE?.trim().toLowerCase() === "mock"
  ) {
    return {
      available: true,
      mode: "mock",
      baseUrl,
      model,
      liveSafe: false
    };
  }

  const nodeApiKey = cleanOptional(env.DEEPSEEK_API_KEY);
  const publicApiKey = cleanOptional(env.EXPO_PUBLIC_DEEPSEEK_API_KEY);
  const allowPublicDevKey = isTruthyEnv(env.FEATURE_SPRINT_DEEPSEEK_ALLOW_PUBLIC_DEV_KEY);
  const isBrowserClient = context.isBrowserClient === true;

  if (nodeApiKey && !isBrowserClient) {
    return {
      available: true,
      apiKey: nodeApiKey,
      model,
      baseUrl,
      mode: "live",
      liveSafe: true
    };
  }

  if (publicApiKey && allowPublicDevKey && !isBrowserClient) {
    return {
      available: true,
      apiKey: publicApiKey,
      model,
      baseUrl,
      mode: "live",
      devOnlyPublicKey: true,
      liveSafe: true
    };
  }

  return {
    available: false,
    mode: "unconfigured",
    baseUrl,
    model,
    liveSafe: false
  };
}
