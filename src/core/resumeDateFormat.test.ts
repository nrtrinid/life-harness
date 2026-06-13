import { describe, expect, it } from "vitest";

import { normalizeResumeDate } from "./resumeDateFormat";

describe("normalizeResumeDate", () => {
  it("capitalizes lowercase month names", () => {
    expect(normalizeResumeDate("april 2023")).toBe("April 2023");
    expect(normalizeResumeDate("september 2024")).toBe("September 2024");
  });

  it("expands abbreviated months and normalizes range separators", () => {
    expect(normalizeResumeDate("Apr 2023-Jul 2023")).toBe("April 2023 – July 2023");
    expect(normalizeResumeDate("aug 2023 - may 2026")).toBe("August 2023 – May 2026");
  });

  it("preserves present, expected, season, and year-only values", () => {
    expect(normalizeResumeDate("2025-Present")).toBe("2025 – Present");
    expect(normalizeResumeDate("Expected may 2026")).toBe("Expected May 2026");
    expect(normalizeResumeDate("Fall 2024")).toBe("Fall 2024");
    expect(normalizeResumeDate("2026")).toBe("2026");
  });
});
