import { describe, expect, it } from "vitest";

import {
  buildSuggestedSourceFromDetection,
  detectJobSourceFromUrl,
  normalizePastedUrl
} from "./jobSourceDiscovery";

describe("normalizePastedUrl", () => {
  it("trims whitespace and wrapping quotes", () => {
    expect(normalizePastedUrl('  "https://example.com/jobs"  ')).toBe("https://example.com/jobs");
  });
});

describe("detectJobSourceFromUrl", () => {
  it("detects Greenhouse API URL unchanged", () => {
    const url = "https://boards-api.greenhouse.io/v1/boards/spacex/jobs";
    const result = detectJobSourceFromUrl(url);
    expect(result.detectedKind).toBe("greenhouse");
    expect(result.runnableUrl).toBe(url);
    expect(result.confidence).toBe("high");
    expect(result.isRunnable).toBe(true);
  });

  it("derives Greenhouse API URL from hosted board", () => {
    const result = detectJobSourceFromUrl("https://boards.greenhouse.io/netskope");
    expect(result.detectedKind).toBe("greenhouse");
    expect(result.runnableUrl).toBe("https://boards-api.greenhouse.io/v1/boards/netskope/jobs");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.isRunnable).toBe(true);
  });

  it("derives Lever API URL with mode=json from jobs page", () => {
    const result = detectJobSourceFromUrl("https://jobs.lever.co/weRide");
    expect(result.detectedKind).toBe("lever");
    expect(result.runnableUrl).toBe("https://api.lever.co/v0/postings/weRide?mode=json");
    expect(result.isRunnable).toBe(true);
  });

  it("preserves existing query params and sets mode=json on Lever API URL", () => {
    const result = detectJobSourceFromUrl(
      "https://api.lever.co/v0/postings/secureframe?foo=bar"
    );
    expect(result.detectedKind).toBe("lever");
    const parsed = new URL(result.runnableUrl);
    expect(parsed.searchParams.get("mode")).toBe("json");
    expect(parsed.searchParams.get("foo")).toBe("bar");
    expect(result.runnableUrl).not.toContain("?mode=json?mode=json");
  });

  it("adds mode=json when Lever API URL already has mode=json", () => {
    const result = detectJobSourceFromUrl(
      "https://api.lever.co/v0/postings/veeva?mode=json"
    );
    expect(new URL(result.runnableUrl).searchParams.getAll("mode")).toEqual(["json"]);
  });

  it("derives Ashby posting-api URL from hosted jobs page", () => {
    const result = detectJobSourceFromUrl("https://jobs.ashbyhq.com/notion");
    expect(result.detectedKind).toBe("ashby");
    expect(result.runnableUrl).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/notion?includeCompensation=true"
    );
    expect(result.isRunnable).toBe(true);
  });

  it("adds includeCompensation=true via searchParams on Ashby API URL", () => {
    const result = detectJobSourceFromUrl(
      "https://api.ashbyhq.com/posting-api/job-board/cohere"
    );
    expect(new URL(result.runnableUrl).searchParams.get("includeCompensation")).toBe("true");
  });

  it("does not duplicate includeCompensation on Ashby API URL that already has it", () => {
    const result = detectJobSourceFromUrl(
      "https://api.ashbyhq.com/posting-api/job-board/eliseai?includeCompensation=true&foo=bar"
    );
    const parsed = new URL(result.runnableUrl);
    expect(parsed.searchParams.getAll("includeCompensation")).toEqual(["true"]);
    expect(parsed.searchParams.get("foo")).toBe("bar");
  });

  it("defaults generic https URL to jobposting_jsonld with low confidence", () => {
    const result = detectJobSourceFromUrl("https://example.com/careers/engineering");
    expect(result.detectedKind).toBe("jobposting_jsonld");
    expect(result.confidence).toBe("low");
    expect(result.isRunnable).toBe(true);
  });

  it("returns company_careers non-runnable for Workday URLs before generic fallback", () => {
    const result = detectJobSourceFromUrl(
      "https://northropgrumman.wd1.myworkdayjobs.com/en-US/Careers"
    );
    expect(result.detectedKind).toBe("company_careers");
    expect(result.isRunnable).toBe(false);
    expect(result.detectedKind).not.toBe("jobposting_jsonld");
  });

  it("detects GovernmentJobs careers URL as runnable governmentjobs", () => {
    const result = detectJobSourceFromUrl("https://www.governmentjobs.com/careers/sdcounty");
    expect(result.detectedKind).toBe("governmentjobs");
    expect(result.detectedKind).not.toBe("jobposting_jsonld");
    expect(result.detectedKind).not.toBe("company_careers");
    expect(result.isRunnable).toBe(true);
    expect(result.sourceName).toBe("County of San Diego");
    expect(result.runnableUrl).toBe("https://www.governmentjobs.com/careers/sdcounty");
  });

  it("detects sandiego careers URL with friendly agency name", () => {
    const result = detectJobSourceFromUrl("https://www.governmentjobs.com/careers/sandiego");
    expect(result.detectedKind).toBe("governmentjobs");
    expect(result.isRunnable).toBe(true);
    expect(result.sourceName).toBe("City of San Diego");
  });

  it("does not treat newprint URL as preferred runnable careers source", () => {
    const result = detectJobSourceFromUrl("https://www.governmentjobs.com/jobs/newprint/12345");
    expect(result.detectedKind).toBe("governmentjobs");
    expect(result.isRunnable).toBe(false);
    expect(result.warnings.some((warning) => warning.includes("/careers/{agency}"))).toBe(true);
  });

  it("detects lacounty careers before generic fallback", () => {
    const result = detectJobSourceFromUrl("https://www.governmentjobs.com/careers/lacounty?utm_source=test");
    expect(result.detectedKind).toBe("governmentjobs");
    expect(result.detectedKind).not.toBe("jobposting_jsonld");
    expect(result.runnableUrl).toBe("https://www.governmentjobs.com/careers/lacounty");
  });

  it("returns company_careers non-runnable for iCIMS", () => {
    const result = detectJobSourceFromUrl("https://careers-qualcomm.icims.com/jobs/search");
    expect(result.detectedKind).toBe("company_careers");
    expect(result.isRunnable).toBe(false);
  });

  it("returns company_careers non-runnable for LinkedIn", () => {
    const result = detectJobSourceFromUrl("https://www.linkedin.com/jobs/view/123");
    expect(result.detectedKind).toBe("company_careers");
    expect(result.isRunnable).toBe(false);
  });

  it("returns company_careers non-runnable for Indeed", () => {
    const result = detectJobSourceFromUrl("https://www.indeed.com/viewjob?jk=abc");
    expect(result.detectedKind).toBe("company_careers");
    expect(result.isRunnable).toBe(false);
  });

  it("returns company_careers non-runnable for Microsoft careers", () => {
    const result = detectJobSourceFromUrl("https://careers.microsoft.com/us/en/search-results");
    expect(result.detectedKind).toBe("company_careers");
    expect(result.isRunnable).toBe(false);
  });

  it("returns non-runnable result with warning for invalid URL", () => {
    const result = detectJobSourceFromUrl("not-a-valid-url");
    expect(result.isRunnable).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("buildSuggestedSourceFromDetection", () => {
  it("builds partial JobSource with defaults", () => {
    const detection = detectJobSourceFromUrl("https://boards.greenhouse.io/opswat");
    const suggested = buildSuggestedSourceFromDetection(detection);
    expect(suggested.name).toBe("Opswat");
    expect(suggested.kind).toBe("greenhouse");
    expect(suggested.enabled).toBe(true);
    expect(suggested.cadence).toBe("manual");
    expect(suggested.maxResults).toBe(25);
  });
});
