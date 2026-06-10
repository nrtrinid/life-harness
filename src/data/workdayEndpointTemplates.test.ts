import { describe, expect, it } from "vitest";

import { validateJobSourceRequestConfig } from "../core/jobSourceRequestConfig";
import { NORTHROP_WORKDAY_CXS_URL } from "../core/jobSourceHealth";
import {
  applyWorkdayEndpointTemplate,
  getWorkdayEndpointTemplate,
  isWorkdayTemplateRunnable,
  WORKDAY_ENDPOINT_TEMPLATES
} from "./workdayEndpointTemplates";

describe("workdayEndpointTemplates", () => {
  it("includes Northrop, fixture, and Qualcomm templates", () => {
    expect(WORKDAY_ENDPOINT_TEMPLATES.map((template) => template.id)).toEqual([
      "northrop-workday-cxs",
      "workday-endpoint-fixture",
      "qualcomm-workday-guide"
    ]);
  });

  it("Northrop template creates runnable workday source with pagination", () => {
    const template = getWorkdayEndpointTemplate("northrop-workday-cxs");
    expect(template).toBeDefined();
    const input = applyWorkdayEndpointTemplate(template!);
    expect(input.url).toBe(NORTHROP_WORKDAY_CXS_URL);
    expect(input.requestConfig?.method).toBe("POST");
    expect(input.requestConfig?.pagination?.mode).toBe("workday_offset");
    expect(validateJobSourceRequestConfig(input.requestConfig)).toEqual({ ok: true });
  });

  it("fixture template creates requestConfig without pagination", () => {
    const template = getWorkdayEndpointTemplate("workday-endpoint-fixture");
    const input = applyWorkdayEndpointTemplate(template!);
    expect(input.url).toBe("/fixtures/sample-workday-cxs-response.json");
    expect(input.requestConfig?.pagination).toBeUndefined();
    expect(validateJobSourceRequestConfig(input.requestConfig)).toEqual({ ok: true });
  });

  it("Qualcomm remains endpoint-needed and not falsely runnable", () => {
    const template = getWorkdayEndpointTemplate("qualcomm-workday-guide");
    expect(template?.endpointNeeded).toBe(true);
    expect(isWorkdayTemplateRunnable(template!)).toBe(false);
    const input = applyWorkdayEndpointTemplate(template!);
    expect(input.requestConfig).toBeUndefined();
    expect(input.url).toContain("qualcomm.wd12.myworkdayjobs.com");
  });
});
