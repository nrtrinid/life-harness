import { describe, expect, it } from "vitest";

import {
  DEFAULT_GATEWAY_MAX_INPUT_CHARS,
  DEFAULT_GATEWAY_TIMEOUT_SECONDS,
  DEFAULT_RAW_LAB_MAX_INPUT_CHARS
} from "./gatewayBudget";
import {
  fallbackGatewayHealthBudget,
  fetchGatewayHealthBudget
} from "./gatewayHealthClient";

describe("gatewayHealthClient", () => {
  it("falls back to app defaults when health is unavailable", () => {
    expect(fallbackGatewayHealthBudget()).toEqual({
      maxInputChars: DEFAULT_GATEWAY_MAX_INPUT_CHARS,
      rawLabMaxInputChars: DEFAULT_RAW_LAB_MAX_INPUT_CHARS,
      timeoutSeconds: DEFAULT_GATEWAY_TIMEOUT_SECONDS
    });
  });

  it("parses budget fields from /health", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          budget: {
            max_input_chars: 18_000,
            raw_lab_max_input_chars: 32_000,
            timeout_seconds: 180
          }
        })
      }) as Response;

    await expect(fetchGatewayHealthBudget("http://127.0.0.1:8111")).resolves.toEqual({
      maxInputChars: 18_000,
      rawLabMaxInputChars: 32_000,
      timeoutSeconds: 180
    });

    global.fetch = originalFetch;
  });
});
