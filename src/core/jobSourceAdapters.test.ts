import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractJobPostingsFromJsonLdHtml,
  getAdapterForKind,
  GOVERNMENTJOBS_ZERO_LISTINGS_MESSAGE,
  ICIMS_ZERO_LISTINGS_MESSAGE,
  inferRoleType,
  normalizeWithAdapter,
  parseGovernmentJobsListingHtml,
  parseIcimsListingHtml,
  parseWorkdaySearchPayload,
  resolveGovernmentJobsFetchUrl,
  resolveIcimsFetchUrl,
  stripHtml,
  WORKDAY_ZERO_LISTINGS_MESSAGE
} from "./jobSourceAdapters";
import type { JobSource } from "./types";

const fixtureDir = join(process.cwd(), "public/fixtures");
const listingHtml = readFileSync(join(fixtureDir, "sample-governmentjobs-listing.html"), "utf8");
const emptyHtml = readFileSync(join(fixtureDir, "sample-governmentjobs-empty.html"), "utf8");
const workdaySearchJson = readFileSync(join(fixtureDir, "sample-workday-search.json"), "utf8");
const workdayEmptyJson = readFileSync(join(fixtureDir, "sample-workday-empty.json"), "utf8");
const workdayCxsResponseJson = readFileSync(join(fixtureDir, "sample-workday-cxs-response.json"), "utf8");
const icimsListingHtml = readFileSync(join(fixtureDir, "sample-icims-listing.html"), "utf8");
const icimsEmptyHtml = readFileSync(join(fixtureDir, "sample-icims-empty.html"), "utf8");

const greenhouseSource: JobSource = {
  id: "source-test",
  name: "Acme Careers",
  url: "https://example.com/jobs.json",
  kind: "greenhouse",
  enabled: true,
  cadence: "manual"
};

describe("jobSourceAdapters", () => {
  it("returns empty list for unknown shapes", () => {
    const result = normalizeWithAdapter(null, greenhouseSource);
    expect(result.postings).toEqual([]);
  });

  it("normalizes greenhouse-like JSON", () => {
    const raw = {
      jobs: [
        {
          title: "Software Engineer — Security",
          location: { name: "Remote" },
          absolute_url: "https://boards.example.com/jobs/1",
          content: "Python, TypeScript, React, security, application security."
        }
      ]
    };
    const result = normalizeWithAdapter(raw, greenhouseSource);
    expect(result.postings).toHaveLength(1);
    expect(result.postings[0]?.roleTitle).toBe("Software Engineer — Security");
    expect(result.postings[0]?.roleType).toBe("cybersecurity");
  });

  it("normalizes lever-like JSON", () => {
    const source: JobSource = { ...greenhouseSource, kind: "lever" };
    const raw = {
      data: [
        {
          text: "Full Stack Developer",
          hostedUrl: "https://jobs.lever.co/example/1",
          categories: { location: "Remote", team: "Platform" },
          descriptionPlain: "Build React and TypeScript applications with testing."
        }
      ]
    };
    const result = normalizeWithAdapter(raw, source);
    expect(result.postings[0]?.company).toBe("Platform");
    expect(result.postings[0]?.roleType).toBe("full_stack");
  });

  it("normalizes ashby-like JSON", () => {
    const source: JobSource = { ...greenhouseSource, kind: "ashby" };
    const raw = {
      jobs: [
        {
          title: "Security Engineer",
          jobUrl: "https://jobs.ashbyhq.com/example/1",
          descriptionHtml: "<p>Application security and secure development.</p>"
        }
      ]
    };
    const result = normalizeWithAdapter(raw, source);
    expect(result.postings[0]?.description).toContain("Application security");
  });

  it("extracts JobPosting from JSON-LD HTML", () => {
    const html = `
      <html>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Security Analyst",
            "description": "Monitor security events and application security controls.",
            "hiringOrganization": { "name": "Example Corp" },
            "url": "https://example.com/jobs/security-analyst"
          }
        </script>
      </html>
    `;
    const postings = extractJobPostingsFromJsonLdHtml(html);
    expect(postings).toHaveLength(1);
    const source: JobSource = { ...greenhouseSource, kind: "jobposting_jsonld" };
    const result = normalizeWithAdapter(html, source);
    expect(result.postings[0]?.roleTitle).toBe("Security Analyst");
  });

  it("has no adapter for company_careers", () => {
    expect(getAdapterForKind("company_careers")).toBeUndefined();
    const source: JobSource = { ...greenhouseSource, kind: "company_careers" };
    const result = normalizeWithAdapter("{}", source);
    expect(result.postings).toEqual([]);
    expect(result.errors[0]).toContain("Unsupported source kind");
  });

  it("classifies civil engineer as other, not software", () => {
    expect(inferRoleType("Civil Engineer", "County infrastructure projects.")).toBe("other");
    expect(inferRoleType("Software Engineer", "TypeScript and React services.")).toBe("software");
  });

  it("strips HTML from descriptions", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
    expect(stripHtml("Sheriff&#39;s Mechanic")).toBe("Sheriff's Mechanic");
  });

  it("resolves GovernmentJobs careers URLs to listing endpoint", () => {
    expect(resolveGovernmentJobsFetchUrl("https://www.governmentjobs.com/careers/sdcounty")).toBe(
      "https://www.governmentjobs.com/careers/home/index?agency=sdcounty"
    );
    expect(resolveGovernmentJobsFetchUrl("/fixtures/sample-governmentjobs-listing.html")).toBe(
      "/fixtures/sample-governmentjobs-listing.html"
    );
  });

  it("parses governmentjobs fixture with at least two postings", () => {
    const source: JobSource = {
      ...greenhouseSource,
      kind: "governmentjobs",
      name: "County of San Diego",
      url: "https://www.governmentjobs.com/careers/sdcounty"
    };
    const postings = parseGovernmentJobsListingHtml(listingHtml, source);
    expect(postings.length).toBeGreaterThanOrEqual(2);
    expect(postings.every((posting) => posting.roleTitle.length > 0)).toBe(true);
    expect(postings.every((posting) => posting.sourceUrl?.includes("/careers/sdcounty/jobs/"))).toBe(
      true
    );
    expect(postings[0]?.location).toBeTruthy();
    expect(postings[0]?.description).toContain("Title:");
    expect(postings.some((posting) => posting.roleType === "cybersecurity" || posting.roleType === "it")).toBe(
      true
    );
  });

  it("ignores newprint links in governmentjobs fallback parsing", () => {
    const html = `
      <a href="/jobs/newprint/999">Print</a>
      <a href="/careers/sdcounty/jobs/111/example-role">Example Role</a>
    `;
    const source: JobSource = {
      ...greenhouseSource,
      kind: "governmentjobs",
      name: "County of San Diego",
      url: "https://www.governmentjobs.com/careers/sdcounty"
    };
    const postings = parseGovernmentJobsListingHtml(html, source);
    expect(postings).toHaveLength(1);
    expect(postings[0]?.roleTitle).toBe("Example Role");
  });

  it("returns empty list for unsupported governmentjobs HTML", () => {
    const source: JobSource = {
      ...greenhouseSource,
      kind: "governmentjobs",
      name: "County of San Diego",
      url: "https://www.governmentjobs.com/careers/sdcounty"
    };
    expect(parseGovernmentJobsListingHtml(emptyHtml, source)).toEqual([]);
    expect(normalizeWithAdapter(emptyHtml, source).postings).toEqual([]);
  });

  it("normalizes governmentjobs via adapter registry", () => {
    const source: JobSource = {
      ...greenhouseSource,
      kind: "governmentjobs",
      name: "County of San Diego",
      url: "/fixtures/sample-governmentjobs-listing.html"
    };
    const result = normalizeWithAdapter(listingHtml, source);
    expect(result.errors).toEqual([]);
    expect(result.postings.length).toBeGreaterThanOrEqual(2);
    expect(getAdapterForKind("governmentjobs")).toBeDefined();
    expect(GOVERNMENTJOBS_ZERO_LISTINGS_MESSAGE).toContain("No GovernmentJobs listings found");
  });

  it("resolves icims search URLs with iframe params", () => {
    expect(resolveIcimsFetchUrl("https://careers-viasat.icims.com/jobs/search")).toBe(
      "https://careers-viasat.icims.com/jobs/search?ss=1&in_iframe=1"
    );
    expect(resolveIcimsFetchUrl("/fixtures/sample-icims-listing.html")).toBe(
      "/fixtures/sample-icims-listing.html"
    );
  });

  it("parses icims fixture with at least two postings", () => {
    const source: JobSource = {
      ...greenhouseSource,
      kind: "icims",
      name: "Viasat — iCIMS",
      url: "https://careers-viasat.icims.com/jobs/search?ss=1&in_iframe=1"
    };
    const postings = parseIcimsListingHtml(icimsListingHtml, source);
    expect(postings.length).toBeGreaterThanOrEqual(2);
    expect(postings.every((posting) => posting.sourceUrl?.includes("careers-viasat.icims.com/jobs/"))).toBe(
      true
    );
    expect(postings[0]?.location).toBeTruthy();
    expect(postings.some((posting) => posting.roleType === "software")).toBe(true);
  });

  it("returns empty list for icims redirect shell HTML", () => {
    const source: JobSource = {
      ...greenhouseSource,
      kind: "icims",
      name: "Viasat — iCIMS",
      url: "https://careers-viasat.icims.com/jobs/search?ss=1&in_iframe=1"
    };
    expect(parseIcimsListingHtml(icimsEmptyHtml, source)).toEqual([]);
    expect(normalizeWithAdapter(icimsEmptyHtml, source).postings).toEqual([]);
    expect(ICIMS_ZERO_LISTINGS_MESSAGE).toContain("No iCIMS listings found");
    expect(getAdapterForKind("icims")).toBeDefined();
  });

  it("parses workday fixture with at least two postings", () => {
    const source: JobSource = {
      ...greenhouseSource,
      kind: "workday",
      name: "Qualcomm",
      url: "https://qualcomm.wd12.myworkdayjobs.com/en-US/External"
    };
    const postings = parseWorkdaySearchPayload(JSON.parse(workdaySearchJson), source);
    expect(postings.length).toBeGreaterThanOrEqual(2);
    expect(postings[0]?.roleTitle).toContain("Software Engineer");
    expect(postings[0]?.sourceUrl).toContain("qualcomm.wd12.myworkdayjobs.com");
    expect(postings[0]?.location).toBeTruthy();
    expect(postings[0]?.description).toContain("Title:");
    expect(postings.some((posting) => posting.roleType === "cybersecurity")).toBe(true);
  });

  it("returns empty list for empty workday fixture", () => {
    const source: JobSource = {
      ...greenhouseSource,
      kind: "workday",
      name: "Qualcomm",
      url: "https://qualcomm.wd12.myworkdayjobs.com/en-US/External"
    };
    expect(parseWorkdaySearchPayload(JSON.parse(workdayEmptyJson), source)).toEqual([]);
  });

  it("returns empty list for workday HTML string", () => {
    const source: JobSource = {
      ...greenhouseSource,
      kind: "workday",
      name: "Qualcomm",
      url: "https://qualcomm.wd12.myworkdayjobs.com/en-US/External"
    };
    const result = normalizeWithAdapter("<html><body>Loading...</body></html>", source);
    expect(result.postings).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("normalizes workday via adapter registry", () => {
    const source: JobSource = {
      ...greenhouseSource,
      kind: "workday",
      name: "Qualcomm",
      url: "/fixtures/sample-workday-search.json"
    };
    const result = normalizeWithAdapter(JSON.parse(workdaySearchJson), source);
    expect(result.errors).toEqual([]);
    expect(result.postings.length).toBeGreaterThanOrEqual(2);
    expect(getAdapterForKind("workday")).toBeDefined();
    expect(WORKDAY_ZERO_LISTINGS_MESSAGE).toContain("No supported Workday postings found");
  });

  it("parses workday CXS response fixture with nested body.jobPostings", () => {
    const source: JobSource = {
      ...greenhouseSource,
      kind: "workday",
      name: "Qualcomm",
      url: "https://qualcomm.wd12.myworkdayjobs.com/wday/cxs/qualcomm/External/jobs"
    };
    const postings = parseWorkdaySearchPayload(JSON.parse(workdayCxsResponseJson), source);
    expect(postings.length).toBeGreaterThanOrEqual(2);
    expect(postings[0]?.sourceUrl).toContain("qualcomm.wd12.myworkdayjobs.com");
    expect(postings[0]?.location).toBeTruthy();
    expect(postings[0]?.description).toContain("Title:");
    expect(postings.some((posting) => posting.roleType === "cybersecurity")).toBe(true);
  });
});
