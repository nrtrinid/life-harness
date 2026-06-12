import type { JobSource, JobSourceKind } from "./types";

export type SourceDetectionConfidence = "high" | "medium" | "low";

export type SourceDetectionResult = {
  inputUrl: string;
  detectedKind: JobSourceKind;
  runnableUrl: string;
  sourceName: string;
  confidence: SourceDetectionConfidence;
  notes: string[];
  warnings: string[];
  isRunnable: boolean;
};

const DERIVED_URL_WARNING = "Derived URL should be tested before saving.";

export const GOVERNMENTJOBS_AGENCY_NAMES: Record<string, string> = {
  sdcounty: "County of San Diego",
  sandiego: "City of San Diego",
  lacounty: "Los Angeles County",
  oc: "Orange County"
};

export const WORKDAY_KNOWN_NAMES: Record<string, string> = {
  qualcomm: "Qualcomm",
  ngc: "Northrop Grumman"
};

function resolveGovernmentJobsAgencyName(agency: string): string {
  return GOVERNMENTJOBS_AGENCY_NAMES[agency.toLowerCase()] ?? titleCaseSlug(agency);
}

function canonicalGovernmentJobsUrl(parsed: URL): string {
  const careersMatch = parsed.pathname.match(/^(\/careers\/[^/]+)\/?$/i);
  if (careersMatch) {
    return `${parsed.protocol}//${parsed.host}${careersMatch[1]}`;
  }
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "")}`;
}

export function normalizePastedUrl(inputUrl: string): string {
  let trimmed = inputUrl.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseHttpUrl(inputUrl: string): URL | null {
  try {
    const parsed = new URL(inputUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function firstPathSegment(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  return segments[0] ?? null;
}

function detectUnsupportedDomain(parsed: URL): SourceDetectionResult | null {
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const haystack = `${host}${path}`;

  const checks: { match: boolean; label: string }[] = [
    { match: host.includes("icims") || haystack.includes("icims"), label: "iCIMS" },
    {
      match:
        (host.includes("microsoft") && (path.includes("career") || path.includes("apply"))) ||
        host.includes("careers.microsoft.com"),
      label: "Microsoft careers"
    },
    { match: host.includes("linkedin.com"), label: "LinkedIn" },
    { match: host.includes("indeed.com"), label: "Indeed" }
  ];

  const hit = checks.find((check) => check.match);
  if (!hit) {
    return null;
  }

  const name = titleCaseSlug(firstPathSegment(parsed.pathname) ?? parsed.hostname.split(".")[0] ?? "Company");
  return {
    inputUrl: parsed.href,
    detectedKind: "company_careers",
    runnableUrl: parsed.href,
    sourceName: name,
    confidence: "high",
    notes: [
      `${hit.label} is registry-only for now — adapter needed before fetch.`,
      "You can still save this as a target source."
    ],
    warnings: [],
    isRunnable: false
  };
}

function withGreenhouseJobContent(url: URL): string {
  const next = new URL(url.href);
  next.searchParams.set("content", "true");
  return next.href;
}

function greenhouseBoardJobsApiUrl(slug: string): string {
  return withGreenhouseJobContent(
    new URL(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)
  );
}

function detectGreenhouse(parsed: URL, inputUrl: string): SourceDetectionResult | null {
  const host = parsed.hostname.toLowerCase();

  const apiMatch = parsed.pathname.match(/\/v1\/boards\/([^/]+)\/jobs\/?$/i);
  if (host === "boards-api.greenhouse.io" && apiMatch) {
    const slug = apiMatch[1];
    return {
      inputUrl,
      detectedKind: "greenhouse",
      runnableUrl: withGreenhouseJobContent(parsed),
      sourceName: titleCaseSlug(slug),
      confidence: "high",
      notes: ["Greenhouse public jobs API URL (with job content)."],
      warnings: [],
      isRunnable: true
    };
  }

  const boardMatch = parsed.pathname.match(/^\/([^/]+)\/?$/);
  if (
    (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") &&
    boardMatch
  ) {
    const slug = boardMatch[1];
    return {
      inputUrl,
      detectedKind: "greenhouse",
      runnableUrl: greenhouseBoardJobsApiUrl(slug),
      sourceName: titleCaseSlug(slug),
      confidence: "medium",
      notes: ["Derived Greenhouse API URL from hosted board (with job content)."],
      warnings: [DERIVED_URL_WARNING],
      isRunnable: true
    };
  }

  return null;
}

function withLeverJsonMode(url: URL): string {
  const next = new URL(url.href);
  next.searchParams.set("mode", "json");
  return next.href;
}

function detectLever(parsed: URL, inputUrl: string): SourceDetectionResult | null {
  const host = parsed.hostname.toLowerCase();

  const apiMatch = parsed.pathname.match(/^\/v0\/postings\/([^/]+)\/?$/i);
  if (host === "api.lever.co" && apiMatch) {
    const company = apiMatch[1];
    return {
      inputUrl,
      detectedKind: "lever",
      runnableUrl: withLeverJsonMode(parsed),
      sourceName: titleCaseSlug(company),
      confidence: "high",
      notes: ["Lever public postings API URL."],
      warnings: [],
      isRunnable: true
    };
  }

  const jobsMatch = parsed.pathname.match(/^\/([^/]+)\/?$/);
  if (host === "jobs.lever.co" && jobsMatch) {
    const company = jobsMatch[1];
    const apiUrl = new URL(`https://api.lever.co/v0/postings/${company}`);
    apiUrl.searchParams.set("mode", "json");
    return {
      inputUrl,
      detectedKind: "lever",
      runnableUrl: apiUrl.href,
      sourceName: titleCaseSlug(company),
      confidence: "medium",
      notes: ["Derived Lever API URL from hosted jobs page."],
      warnings: [DERIVED_URL_WARNING],
      isRunnable: true
    };
  }

  return null;
}

function withAshbyCompensation(url: URL): string {
  const next = new URL(url.href);
  if (!next.searchParams.has("includeCompensation")) {
    next.searchParams.set("includeCompensation", "true");
  }
  return next.href;
}

function detectAshby(parsed: URL, inputUrl: string): SourceDetectionResult | null {
  const host = parsed.hostname.toLowerCase();

  const apiMatch = parsed.pathname.match(/^\/posting-api\/job-board\/([^/]+)\/?$/i);
  if (host === "api.ashbyhq.com" && apiMatch) {
    const org = apiMatch[1];
    return {
      inputUrl,
      detectedKind: "ashby",
      runnableUrl: withAshbyCompensation(parsed),
      sourceName: titleCaseSlug(org),
      confidence: "high",
      notes: ["Ashby public job board API URL."],
      warnings: [],
      isRunnable: true
    };
  }

  const jobsMatch = parsed.pathname.match(/^\/([^/]+)\/?$/);
  if (host === "jobs.ashbyhq.com" && jobsMatch) {
    const org = jobsMatch[1];
    const apiUrl = new URL(`https://api.ashbyhq.com/posting-api/job-board/${org}`);
    apiUrl.searchParams.set("includeCompensation", "true");
    return {
      inputUrl,
      detectedKind: "ashby",
      runnableUrl: apiUrl.href,
      sourceName: titleCaseSlug(org),
      confidence: "medium",
      notes: ["Derived Ashby API URL from hosted jobs page."],
      warnings: [DERIVED_URL_WARNING],
      isRunnable: true
    };
  }

  return null;
}

function detectGovernmentJobs(parsed: URL, inputUrl: string): SourceDetectionResult | null {
  const host = parsed.hostname.toLowerCase();
  if (!host.includes("governmentjobs.com") && !host.includes("neogov")) {
    return null;
  }

  const careersMatch = parsed.pathname.match(/^\/careers\/([^/]+)\/?$/i);
  if (careersMatch) {
    const agency = careersMatch[1] ?? "";
    return {
      inputUrl,
      detectedKind: "governmentjobs",
      runnableUrl: canonicalGovernmentJobsUrl(parsed),
      sourceName: resolveGovernmentJobsAgencyName(agency),
      confidence: "high",
      notes: ["GovernmentJobs / NEOGOV public-sector source detected."],
      warnings: ["Listing HTML is parsed defensively; test before saving."],
      isRunnable: true
    };
  }

  return {
    inputUrl,
    detectedKind: "governmentjobs",
    runnableUrl: parsed.href,
    sourceName: titleCaseSlug(firstPathSegment(parsed.pathname) ?? "GovernmentJobs"),
    confidence: "low",
    notes: ["GovernmentJobs / NEOGOV URL detected."],
    warnings: ["Use a /careers/{agency} source URL."],
    isRunnable: false
  };
}

function resolveWorkdaySiteName(parsed: URL): string {
  const subdomain = parsed.hostname.split(".")[0]?.toLowerCase() ?? "";
  if (WORKDAY_KNOWN_NAMES[subdomain]) {
    return WORKDAY_KNOWN_NAMES[subdomain];
  }

  const jobIndex = parsed.pathname.toLowerCase().indexOf("/job/");
  const sitePath =
    jobIndex >= 0 ? parsed.pathname.slice(0, jobIndex) : parsed.pathname.replace(/\/$/, "");
  const segments = sitePath.split("/").filter(Boolean);
  const siteSegment = segments[segments.length - 1];
  if (siteSegment) {
    return titleCaseSlug(siteSegment);
  }

  return titleCaseSlug(subdomain || "Workday");
}

function canonicalWorkdaySiteUrl(parsed: URL): string {
  const jobIndex = parsed.pathname.toLowerCase().indexOf("/job/");
  const pathname = jobIndex >= 0 ? parsed.pathname.slice(0, jobIndex) : parsed.pathname;
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
}

function detectWorkday(parsed: URL, inputUrl: string): SourceDetectionResult | null {
  const host = parsed.hostname.toLowerCase();
  if (!host.includes("myworkdayjobs.com")) {
    return null;
  }

  const isJobDetail = parsed.pathname.toLowerCase().includes("/job/");
  const warnings = [
    "Workday sites often require a JSON job-search endpoint; test before saving.",
    "If this URL returns an HTML shell, a future endpoint-discovery ticket may be needed."
  ];
  if (isJobDetail) {
    warnings.push("This looks like a job detail URL. Prefer the main external site/search URL.");
  }

  return {
    inputUrl,
    detectedKind: "workday",
    runnableUrl: canonicalWorkdaySiteUrl(parsed),
    sourceName: resolveWorkdaySiteName(parsed),
    confidence: "medium",
    notes: [
      "Workday / MyWorkdayJobs source detected.",
      "Endpoint-backed mode available: paste JSON search endpoint URL and request body in Source Setup.",
      "Workday sources are testable but adapter-limited. Default cadence: manual. Change to daily/weekly only after a successful candidate-producing run."
    ],
    warnings,
    isRunnable: true
  };
}

function detectGenericJsonLd(parsed: URL, inputUrl: string): SourceDetectionResult {
  const hostLabel = parsed.hostname.replace(/^www\./, "");
  const segment = firstPathSegment(parsed.pathname);
  const sourceName = segment ? titleCaseSlug(segment) : titleCaseSlug(hostLabel.split(".")[0] ?? "Source");

  return {
    inputUrl,
    detectedKind: "jobposting_jsonld",
    runnableUrl: parsed.href,
    sourceName,
    confidence: "low",
    notes: ["Will test for JobPosting JSON-LD on this page."],
    warnings: ["Many career pages do not expose structured JobPosting data."],
    isRunnable: true
  };
}

function invalidUrlResult(inputUrl: string): SourceDetectionResult {
  return {
    inputUrl,
    detectedKind: "company_careers",
    runnableUrl: inputUrl,
    sourceName: "",
    confidence: "low",
    notes: [],
    warnings: ["Invalid or unsupported URL. Enter a full http(s) careers or job-board URL."],
    isRunnable: false
  };
}

export function detectJobSourceFromUrl(inputUrl: string): SourceDetectionResult {
  const normalized = normalizePastedUrl(inputUrl);
  if (!normalized) {
    return invalidUrlResult(inputUrl);
  }

  const parsed = parseHttpUrl(normalized);
  if (!parsed) {
    return invalidUrlResult(normalized);
  }

  const greenhouse = detectGreenhouse(parsed, normalized);
  if (greenhouse) {
    return greenhouse;
  }

  const lever = detectLever(parsed, normalized);
  if (lever) {
    return lever;
  }

  const ashby = detectAshby(parsed, normalized);
  if (ashby) {
    return ashby;
  }

  const governmentJobs = detectGovernmentJobs(parsed, normalized);
  if (governmentJobs) {
    return governmentJobs;
  }

  const workday = detectWorkday(parsed, normalized);
  if (workday) {
    return workday;
  }

  const unsupported = detectUnsupportedDomain(parsed);
  if (unsupported) {
    return unsupported;
  }

  return detectGenericJsonLd(parsed, normalized);
}

export function buildSuggestedSourceFromDetection(result: SourceDetectionResult): Partial<JobSource> {
  return {
    name: result.sourceName,
    url: result.runnableUrl || result.inputUrl,
    kind: result.detectedKind,
    enabled: true,
    cadence: result.detectedKind === "workday" ? "manual" : "manual",
    maxResults: 25,
    adapterNotes: result.notes.length > 0 ? result.notes.join(" ") : undefined,
    notes: result.warnings.length > 0 ? result.warnings.join(" ") : undefined
  };
}
