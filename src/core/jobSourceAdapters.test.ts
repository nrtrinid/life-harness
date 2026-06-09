import { describe, expect, it } from "vitest";

import {
  extractJobPostingsFromJsonLdHtml,
  getAdapterForKind,
  normalizeWithAdapter,
  stripHtml
} from "./jobSourceAdapters";
import type { JobSource } from "./types";

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
});
