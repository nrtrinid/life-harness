import { describe, expect, it } from "vitest";

import {
  buildWorkdayPageBody,
  getWorkdayPaginationStartOffset,
  resolveEffectiveMaxResults,
  resolvePaginationDefaults,
  validatePaginationConfig
} from "./jobSourcePagination";
import type { JobSource } from "./types";

const baseSource: JobSource = {
  id: "source-workday",
  name: "Workday",
  url: "https://example.com/jobs",
  kind: "workday",
  enabled: true,
  cadence: "manual",
  requestConfig: {
    method: "POST",
    bodyJson: { appliedFacets: {}, limit: 20, offset: 0, searchText: "" },
    pagination: { mode: "workday_offset", limit: 20, maxPages: 3 }
  }
};

describe("jobSourcePagination", () => {
  it("validates workday_offset requires POST and object body", () => {
    expect(
      validatePaginationConfig({
        method: "GET",
        pagination: { mode: "workday_offset" }
      })
    ).toEqual({ ok: false, error: "Workday pagination requires POST." });

    expect(
      validatePaginationConfig({
        method: "POST",
        bodyJson: "not-an-object",
        pagination: { mode: "workday_offset" }
      })
    ).toEqual({ ok: false, error: "Workday pagination requires a JSON object body." });
  });

  it("clamps limit and maxPages in resolvePaginationDefaults", () => {
    const source: JobSource = {
      ...baseSource,
      requestConfig: {
        method: "POST",
        bodyJson: {},
        pagination: { mode: "workday_offset", limit: 999, maxPages: 99 }
      }
    };
    const defaults = resolvePaginationDefaults(source);
    expect(defaults.limit).toBe(50);
    expect(defaults.maxPages).toBe(5);
  });

  it("resolves effectiveMaxResults from pagination then source then default", () => {
    expect(
      resolveEffectiveMaxResults({
        ...baseSource,
        maxResults: 30,
        requestConfig: {
          method: "POST",
          bodyJson: {},
          pagination: { mode: "workday_offset", maxResults: 40 }
        }
      })
    ).toBe(40);

    expect(resolveEffectiveMaxResults({ ...baseSource, maxResults: 30 })).toBe(30);
    expect(resolveEffectiveMaxResults({ ...baseSource, maxResults: undefined })).toBe(50);
  });

  it("buildWorkdayPageBody sets limit and offset", () => {
    expect(buildWorkdayPageBody({ appliedFacets: {}, searchText: "" }, 40, 20)).toEqual({
      appliedFacets: {},
      searchText: "",
      limit: 20,
      offset: 40
    });
  });

  it("reads start offset from bodyJson", () => {
    expect(getWorkdayPaginationStartOffset({ offset: 10 })).toBe(10);
    expect(getWorkdayPaginationStartOffset({ offset: -1 })).toBe(0);
  });
});
