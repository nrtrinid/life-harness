import { describe, expect, it } from "vitest";

import { getAllNavRoutes, isNavActive, LEGACY_NAV_HREFS } from "./navRoutes";

describe("navRoutes", () => {
  it("includes all legacy nav hrefs plus the career hub", () => {
    const hrefs = new Set(getAllNavRoutes().map((route) => route.href));

    for (const href of LEGACY_NAV_HREFS) {
      expect(hrefs.has(href)).toBe(true);
    }

    expect(hrefs.has("/career")).toBe(true);
    expect(hrefs.size).toBe(LEGACY_NAV_HREFS.length + 1);
  });

  it("detects active routes including index and nested paths", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/index", "/")).toBe(true);
    expect(isNavActive("/board", "/board")).toBe(true);
    expect(isNavActive("/ask-harness", "/ask-harness")).toBe(true);
    expect(isNavActive("/card/abc", "/board")).toBe(false);
    expect(isNavActive("/job-candidates/extra", "/job-candidates")).toBe(true);
  });
});
