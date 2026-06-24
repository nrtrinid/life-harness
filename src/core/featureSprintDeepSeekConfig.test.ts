import { describe, expect, it } from "vitest";

import {
  FEATURE_SPRINT_DEEPSEEK_DEFAULT_FLASH_MODEL,
  FEATURE_SPRINT_DEEPSEEK_DEFAULT_REVIEW_MODEL,
  resolveFeatureSprintDeepSeekConfig,
  resolveFeatureSprintDeepSeekPromptAuditModel,
  resolveFeatureSprintDeepSeekReviewModel
} from "./featureSprintDeepSeekConfig";

describe("featureSprintDeepSeekConfig", () => {
  it("returns unconfigured without API key or mock flag", () => {
    const config = resolveFeatureSprintDeepSeekConfig({});
    expect(config.mode).toBe("unconfigured");
    expect(config.available).toBe(false);
    expect(config.apiKey).toBeUndefined();
  });

  it("defaults review model to deepseek-v4-pro", () => {
    expect(resolveFeatureSprintDeepSeekReviewModel({})).toBe(FEATURE_SPRINT_DEEPSEEK_DEFAULT_REVIEW_MODEL);
    expect(resolveFeatureSprintDeepSeekReviewModel({})).toBe("deepseek-v4-pro");
  });

  it("defaults prompt audit model to Pro and never Flash when unset", () => {
    expect(resolveFeatureSprintDeepSeekPromptAuditModel({})).toBe("deepseek-v4-pro");
    expect(resolveFeatureSprintDeepSeekPromptAuditModel({})).not.toBe(
      FEATURE_SPRINT_DEEPSEEK_DEFAULT_FLASH_MODEL
    );
  });

  it("uses DEEPSEEK_PROMPT_AUDIT_MODEL when set", () => {
    expect(
      resolveFeatureSprintDeepSeekPromptAuditModel({
        DEEPSEEK_PROMPT_AUDIT_MODEL: "deepseek-custom-audit"
      })
    ).toBe("deepseek-custom-audit");
  });

  it("falls back DEEPSEEK_REVIEW_MODEL then DEEPSEEK_MODEL for prompt audit", () => {
    expect(
      resolveFeatureSprintDeepSeekPromptAuditModel({
        DEEPSEEK_REVIEW_MODEL: "deepseek-review-only"
      })
    ).toBe("deepseek-review-only");
    expect(
      resolveFeatureSprintDeepSeekPromptAuditModel({
        DEEPSEEK_MODEL: "deepseek-legacy"
      })
    ).toBe("deepseek-legacy");
  });

  it("uses mock mode when DEEPSEEK_MOCK is set", () => {
    const config = resolveFeatureSprintDeepSeekConfig({ DEEPSEEK_MOCK: "1" });
    expect(config.mode).toBe("mock");
    expect(config.available).toBe(true);
    expect(config.promptAuditModel).toBe("deepseek-v4-pro");
    expect(config.liveSafe).toBe(false);
  });

  it("uses live mode with DEEPSEEK_API_KEY in Node context", () => {
    const config = resolveFeatureSprintDeepSeekConfig(
      { DEEPSEEK_API_KEY: "secret-key" },
      { isBrowserClient: false }
    );
    expect(config.mode).toBe("live");
    expect(config.available).toBe(true);
    expect(config.apiKey).toBe("secret-key");
    expect(config.liveSafe).toBe(true);
    expect(config.promptAuditModel).toBe("deepseek-v4-pro");
  });

  it("ignores EXPO_PUBLIC_DEEPSEEK_API_KEY without explicit dev opt-in", () => {
    const config = resolveFeatureSprintDeepSeekConfig(
      { EXPO_PUBLIC_DEEPSEEK_API_KEY: "public-key" },
      { isBrowserClient: false }
    );
    expect(config.mode).toBe("unconfigured");
    expect(config.available).toBe(false);
  });

  it("allows public dev key only with FEATURE_SPRINT_DEEPSEEK_ALLOW_PUBLIC_DEV_KEY", () => {
    const config = resolveFeatureSprintDeepSeekConfig(
      {
        EXPO_PUBLIC_DEEPSEEK_API_KEY: "public-key",
        FEATURE_SPRINT_DEEPSEEK_ALLOW_PUBLIC_DEV_KEY: "1"
      },
      { isBrowserClient: false }
    );
    expect(config.mode).toBe("live");
    expect(config.devOnlyPublicKey).toBe(true);
    expect(config.apiKey).toBe("public-key");
  });

  it("blocks live mode in browser client context even with node key", () => {
    const config = resolveFeatureSprintDeepSeekConfig(
      { DEEPSEEK_API_KEY: "secret-key" },
      { isBrowserClient: true }
    );
    expect(config.mode).toBe("unconfigured");
    expect(config.available).toBe(false);
    expect(config.liveSafe).toBe(false);
  });

  it("respects custom DEEPSEEK_MODEL when set for review config", () => {
    const config = resolveFeatureSprintDeepSeekConfig({
      DEEPSEEK_MOCK: "1",
      DEEPSEEK_MODEL: "deepseek-v4-flash"
    });
    expect(config.model).toBe("deepseek-v4-flash");
    expect(config.promptAuditModel).toBe("deepseek-v4-flash");
  });
});
