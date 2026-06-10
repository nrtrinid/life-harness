import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractJobPostingsFromJsonLdHtml,
  getAdapterForKind,
  GOVERNMENTJOBS_ZERO_LISTINGS_MESSAGE,
  normalizeWithAdapter,
  parseGovernmentJobsListingHtml,
  stripHtml
} from "./jobSourceAdapters";
import type { JobSource } from "./types";

const fixtureDir = join(process.cwd(), "public/fixtures");
const listingHtml = readFileSync(join(fixtureDir, "sample-governmentjobs-listing.html"), "utf8");
const emptyHtml = readFileSync(join(fixtureDir, "sample-governmentjobs-empty.html"), "utf8");

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

  it("strips HTML from descriptions", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
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
    expect(GOVERNMENTJOBS_ZERO_LISTINGS_MESSAGE).toContain("No static GovernmentJobs listings found");
  });
});
