import { describe, expect, it } from "vitest";

import {
  buildSafeRequestHeaders,
  formatCredentialKeyError,
  parseJsonBodyText,
  validateJobSourceRequestConfig
} from "./jobSourceRequestConfig";

describe("jobSourceRequestConfig", () => {
  it("returns fixed safe JSON headers", () => {
    expect(buildSafeRequestHeaders()).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json"
    });
  });

  it("formats credential key errors with the offending key", () => {
    expect(formatCredentialKeyError("authorization")).toBe(
      "Credential-like key detected: authorization. Do not paste cookies, auth headers, CSRF tokens, or session data."
    );
  });

  it("rejects forbidden keys in parsed JSON body text", () => {
    const result = parseJsonBodyText('{"authorization":"Bearer secret"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("authorization");
    }
  });

  it("rejects GET config when bodyJson contains forbidden keys", () => {
    const result = validateJobSourceRequestConfig({
      method: "GET",
      bodyJson: { sessionToken: "abc" }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("sessionToken");
    }
  });

  it("accepts valid POST config", () => {
    const result = validateJobSourceRequestConfig({
      method: "POST",
      bodyJson: { appliedFacets: {}, limit: 20, offset: 0, searchText: "" }
    });
    expect(result.ok).toBe(true);
  });

  it("requires bodyJson for POST", () => {
    const result = validateJobSourceRequestConfig({ method: "POST" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("JSON body");
    }
  });
});
