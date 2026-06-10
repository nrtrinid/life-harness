import type { JobSource, JobSourceKind, RoleType } from "./types";

export interface NormalizedJobPosting {
  company?: string;
  roleTitle: string;
  sourceUrl?: string;
  location?: string;
  description: string;
  roleType?: RoleType;
}

export interface JobSourceAdapter {
  kind: JobSourceKind;
  label: string;
  normalize: (raw: unknown, source: JobSource) => NormalizedJobPosting[];
}

const SUPPORTED_ADAPTER_KINDS = new Set<JobSourceKind>([
  "greenhouse",
  "lever",
  "ashby",
  "governmentjobs",
  "jobposting_jsonld",
  "manual"
]);

export function getAdapterForKind(kind: JobSourceKind): JobSourceAdapter | undefined {
  if (!SUPPORTED_ADAPTER_KINDS.has(kind)) {
    return undefined;
  }
  return ADAPTERS[kind as keyof typeof ADAPTERS];
}

export function isSupportedAdapterKind(kind: JobSourceKind): boolean {
  return SUPPORTED_ADAPTER_KINDS.has(kind);
}

export function stripHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateDescription(text: string, max = 4000): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 3)}...`;
}

const ROLE_KEYWORDS: Array<{ roleType: RoleType; pattern: RegExp }> = [
  { roleType: "cybersecurity", pattern: /\b(cyber|security|infosec|soc)\b/i },
  { roleType: "data_finance", pattern: /\b(data|finance|analyst|quant)\b/i },
  { roleType: "full_stack", pattern: /\b(full[\s-]?stack|frontend|backend)\b/i },
  { roleType: "software", pattern: /\b(software|developer|engineer|programmer)\b/i },
  { roleType: "it", pattern: /\b(it support|help desk|systems admin|devops)\b/i }
];

export function inferRoleType(title: string, description: string): RoleType {
  const text = `${title} ${description}`;
  for (const entry of ROLE_KEYWORDS) {
    if (entry.pattern.test(text)) {
      return entry.roleType;
    }
  }
  return "other";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeGreenhouse(raw: unknown, source: JobSource): NormalizedJobPosting[] {
  const record = asRecord(raw);
  const jobs = Array.isArray(raw) ? raw : Array.isArray(record?.jobs) ? record.jobs : [];
  const company = source.name.replace(/\s+(Careers|Jobs)$/i, "").trim();

  return jobs
    .map((job): NormalizedJobPosting | undefined => {
      const item = asRecord(job);
      if (!item) {
        return undefined;
      }
      const roleTitle = asString(item.title);
      const description = truncateDescription(
        stripHtml(asString(item.content) ?? asString(item.description) ?? "")
      );
      if (!roleTitle || !description) {
        return undefined;
      }
      const locationRecord = asRecord(item.location);
      return {
        company: asString(item.company) ?? company,
        roleTitle,
        sourceUrl: asString(item.absolute_url) ?? asString(item.url),
        location: asString(locationRecord?.name) ?? asString(item.location),
        description,
        roleType: inferRoleType(roleTitle, description)
      };
    })
    .filter((posting): posting is NormalizedJobPosting => posting !== undefined);
}

function normalizeLever(raw: unknown, source: JobSource): NormalizedJobPosting[] {
  const record = asRecord(raw);
  const postings = Array.isArray(raw)
    ? raw
    : Array.isArray(record?.data)
      ? record.data
      : Array.isArray(record?.postings)
        ? record.postings
        : [];
  const company = source.name.replace(/\s+(Careers|Jobs)$/i, "").trim();

  return postings
    .map((posting): NormalizedJobPosting | undefined => {
      const item = asRecord(posting);
      if (!item) {
        return undefined;
      }
      const roleTitle = asString(item.text) ?? asString(item.title);
      const description = truncateDescription(
        stripHtml(
          asString(item.descriptionPlain) ??
            asString(item.description) ??
            asString(item.textPlain) ??
            ""
        )
      );
      if (!roleTitle || !description) {
        return undefined;
      }
      const categories = asRecord(item.categories);
      return {
        company: asString(categories?.team) ?? asString(item.company) ?? company,
        roleTitle,
        sourceUrl: asString(item.hostedUrl) ?? asString(item.applyUrl),
        location: asString(categories?.location) ?? asString(item.location),
        description,
        roleType: inferRoleType(roleTitle, description)
      };
    })
    .filter((posting): posting is NormalizedJobPosting => posting !== undefined);
}

function normalizeAshby(raw: unknown, source: JobSource): NormalizedJobPosting[] {
  const record = asRecord(raw);
  const jobs = Array.isArray(raw) ? raw : Array.isArray(record?.jobs) ? record.jobs : [];
  const company = source.name.replace(/\s+(Careers|Jobs)$/i, "").trim();

  return jobs
    .map((job): NormalizedJobPosting | undefined => {
      const item = asRecord(job);
      if (!item) {
        return undefined;
      }
      const roleTitle = asString(item.title);
      const description = truncateDescription(
        stripHtml(asString(item.descriptionHtml) ?? asString(item.description) ?? "")
      );
      if (!roleTitle || !description) {
        return undefined;
      }
      const locationRecord = asRecord(item.location);
      return {
        company: asString(item.company) ?? company,
        roleTitle,
        sourceUrl: asString(item.jobUrl) ?? asString(item.url),
        location: asString(locationRecord?.name) ?? asString(item.location),
        description,
        roleType: inferRoleType(roleTitle, description)
      };
    })
    .filter((posting): posting is NormalizedJobPosting => posting !== undefined);
}

function collectJsonLdObjects(raw: unknown, bucket: unknown[]): void {
  if (Array.isArray(raw)) {
    for (const item of raw) {
      collectJsonLdObjects(item, bucket);
    }
    return;
  }
  const record = asRecord(raw);
  if (!record) {
    return;
  }
  const typeValue = record["@type"];
  const types = Array.isArray(typeValue) ? typeValue : typeValue ? [typeValue] : [];
  if (types.some((type) => String(type).toLowerCase().includes("jobposting"))) {
    bucket.push(record);
  }
  if (record["@graph"]) {
    collectJsonLdObjects(record["@graph"], bucket);
  }
}

export function extractJobPostingsFromJsonLdHtml(html: string): unknown[] {
  const matches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const postings: unknown[] = [];
  for (const match of matches) {
    const jsonText = match[1]?.trim();
    if (!jsonText) {
      continue;
    }
    try {
      collectJsonLdObjects(JSON.parse(jsonText), postings);
    } catch {
      // ignore invalid JSON-LD blocks
    }
  }
  return postings;
}

function normalizeJsonLd(raw: unknown, source: JobSource): NormalizedJobPosting[] {
  const html = typeof raw === "string" ? raw : "";
  const objects = html ? extractJobPostingsFromJsonLdHtml(html) : [];
  const company = source.name.replace(/\s+(Careers|Jobs)$/i, "").trim();

  return objects
    .map((object): NormalizedJobPosting | undefined => {
      const item = asRecord(object);
      if (!item) {
        return undefined;
      }
      const roleTitle = asString(item.title);
      const description = truncateDescription(
        stripHtml(asString(item.description) ?? asString(item.summary) ?? "")
      );
      if (!roleTitle || !description) {
        return undefined;
      }
      const hiringOrg = asRecord(item.hiringOrganization);
      const jobLocation = asRecord(item.jobLocation);
      const address = asRecord(jobLocation?.address);
      return {
        company: asString(hiringOrg?.name) ?? company,
        roleTitle,
        sourceUrl: asString(item.url) ?? asString(item.identifier),
        location: asString(address?.addressLocality) ?? asString(jobLocation?.name),
        description,
        roleType: inferRoleType(roleTitle, description)
      };
    })
    .filter((posting): posting is NormalizedJobPosting => posting !== undefined);
}

function normalizeManualObject(item: Record<string, unknown>, source: JobSource): NormalizedJobPosting | undefined {
  const roleTitle = asString(item.roleTitle) ?? asString(item.title);
  const description = truncateDescription(
    stripHtml(
      asString(item.description) ??
        asString(item.jobDescription) ??
        asString(item.content) ??
        ""
    )
  );
  if (!roleTitle || !description) {
    return undefined;
  }
  return {
    company: asString(item.company) ?? source.name,
    roleTitle,
    sourceUrl: asString(item.sourceUrl) ?? asString(item.url),
    location: asString(item.location),
    description,
    roleType: inferRoleType(roleTitle, description)
  };
}

function normalizeManual(raw: unknown, source: JobSource): NormalizedJobPosting[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeManualObject(asRecord(item) ?? {}, source))
      .filter((posting): posting is NormalizedJobPosting => posting !== undefined);
  }
  const record = asRecord(raw);
  if (!record) {
    return [];
  }
  if (Array.isArray(record.postings)) {
    return normalizeManual(record.postings, source);
  }
  const single = normalizeManualObject(record, source);
  return single ? [single] : [];
}

export const GOVERNMENTJOBS_ZERO_LISTINGS_MESSAGE =
  "No static GovernmentJobs listings found. This page may require a future XHR/pagination adapter.";

function extractAgencySlugFromSourceUrl(sourceUrl: string): string | null {
  try {
    const parsed = new URL(
      sourceUrl,
      sourceUrl.startsWith("/") ? "https://www.governmentjobs.com" : undefined
    );
    const match = parsed.pathname.match(/^\/careers\/([^/]+)/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function resolveGovernmentJobsHref(href: string, sourceUrl: string): string {
  const base = sourceUrl.startsWith("http")
    ? sourceUrl
    : `https://www.governmentjobs.com${sourceUrl.startsWith("/") ? sourceUrl : `/${sourceUrl}`}`;
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function isCareersJobDetailPath(href: string, agency: string | null): boolean {
  let pathname = href;
  try {
    pathname = href.startsWith("http") ? new URL(href).pathname : href.split("?")[0] ?? href;
  } catch {
    return false;
  }
  if (agency) {
    return new RegExp(`^/careers/${agency}/jobs/`, "i").test(pathname);
  }
  return /^\/careers\/[^/]+\/jobs\//i.test(pathname);
}

function extractClassText(block: string, className: string): string | undefined {
  const match = block.match(
    new RegExp(`<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<`, "i")
  );
  if (!match?.[1]) {
    return undefined;
  }
  const text = stripHtml(match[1]);
  return text || undefined;
}

function composeGovernmentJobsDescription(input: {
  roleTitle: string;
  location?: string;
  salary?: string;
  department?: string;
  jobType?: string;
  closingDate?: string;
  snippet?: string;
}): string {
  const lines = [`Title: ${input.roleTitle}`];
  if (input.location) {
    lines.push(`Location: ${input.location}`);
  }
  if (input.salary) {
    lines.push(`Salary: ${input.salary}`);
  }
  if (input.department) {
    lines.push(`Department: ${input.department}`);
  }
  if (input.jobType) {
    lines.push(`Job Type: ${input.jobType}`);
  }
  if (input.closingDate) {
    lines.push(`Closing Date: ${input.closingDate}`);
  }
  if (input.snippet) {
    lines.push(`Snippet: ${input.snippet}`);
  }
  return truncateDescription(lines.join("\n"));
}

function buildGovernmentJobsPosting(input: {
  roleTitle: string;
  sourceUrl?: string;
  location?: string;
  salary?: string;
  department?: string;
  jobType?: string;
  closingDate?: string;
  snippet?: string;
  company: string;
}): NormalizedJobPosting {
  const description = composeGovernmentJobsDescription(input);
  return {
    company: input.company,
    roleTitle: input.roleTitle,
    sourceUrl: input.sourceUrl,
    location: input.location,
    description,
    roleType: inferRoleType(input.roleTitle, description)
  };
}

function parseGovernmentJobsListItem(
  block: string,
  source: JobSource,
  company: string
): NormalizedJobPosting | undefined {
  const titleMatch = block.match(
    /<h3[^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
  );
  if (!titleMatch) {
    return undefined;
  }
  const href = titleMatch[1] ?? "";
  const roleTitle = stripHtml(titleMatch[2] ?? "");
  if (!roleTitle) {
    return undefined;
  }

  return buildGovernmentJobsPosting({
    roleTitle,
    sourceUrl: resolveGovernmentJobsHref(href, source.url),
    location: extractClassText(block, "location"),
    salary: extractClassText(block, "salary"),
    department: extractClassText(block, "department"),
    jobType: extractClassText(block, "job-type"),
    closingDate: extractClassText(block, "closing-date"),
    snippet: extractClassText(block, "snippet"),
    company
  });
}

function postingsFromGovernmentJobsJsonLd(html: string, source: JobSource): NormalizedJobPosting[] {
  const company = source.name.replace(/\s+(Careers|Jobs)$/i, "").trim();
  const objects = extractJobPostingsFromJsonLdHtml(html);
  return objects
    .map((object): NormalizedJobPosting | undefined => {
      const item = asRecord(object);
      if (!item) {
        return undefined;
      }
      const roleTitle = asString(item.title);
      if (!roleTitle) {
        return undefined;
      }
      const hiringOrg = asRecord(item.hiringOrganization);
      const jobLocation = asRecord(item.jobLocation);
      const address = asRecord(jobLocation?.address);
      const snippet = stripHtml(asString(item.description) ?? asString(item.summary) ?? "");
      return buildGovernmentJobsPosting({
        roleTitle,
        sourceUrl: asString(item.url) ?? asString(item.identifier),
        location: asString(address?.addressLocality) ?? asString(jobLocation?.name),
        snippet: snippet || undefined,
        company: asString(hiringOrg?.name) ?? company
      });
    })
    .filter((posting): posting is NormalizedJobPosting => posting !== undefined);
}

export function parseGovernmentJobsListingHtml(html: string, source: JobSource): NormalizedJobPosting[] {
  const company = source.name.replace(/\s+(Careers|Jobs)$/i, "").trim();
  const agency = extractAgencySlugFromSourceUrl(source.url);
  const deduped = new Map<string, NormalizedJobPosting>();

  function addPosting(posting: NormalizedJobPosting | undefined) {
    if (!posting) {
      return;
    }
    const key = `${(posting.sourceUrl ?? "").toLowerCase()}|${posting.roleTitle.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, posting);
    }
  }

  for (const match of html.matchAll(/<li[^>]*class=["'][^"']*list-item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    addPosting(parseGovernmentJobsListItem(match[1] ?? "", source, company));
  }

  for (const match of html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1] ?? "";
    if (!isCareersJobDetailPath(href, agency)) {
      continue;
    }
    const roleTitle = stripHtml(match[2] ?? "");
    if (!roleTitle) {
      continue;
    }
    addPosting(
      buildGovernmentJobsPosting({
        roleTitle,
        sourceUrl: resolveGovernmentJobsHref(href, source.url),
        company
      })
    );
  }

  for (const posting of postingsFromGovernmentJobsJsonLd(html, source)) {
    addPosting(posting);
  }

  return [...deduped.values()];
}

function normalizeGovernmentJobs(raw: unknown, source: JobSource): NormalizedJobPosting[] {
  const html = typeof raw === "string" ? raw : "";
  if (!html.trim()) {
    return [];
  }
  return parseGovernmentJobsListingHtml(html, source);
}

const ADAPTERS: Record<
  "greenhouse" | "lever" | "ashby" | "governmentjobs" | "jobposting_jsonld" | "manual",
  JobSourceAdapter
> = {
  greenhouse: {
    kind: "greenhouse",
    label: "Greenhouse",
    normalize: normalizeGreenhouse
  },
  lever: {
    kind: "lever",
    label: "Lever",
    normalize: normalizeLever
  },
  ashby: {
    kind: "ashby",
    label: "Ashby",
    normalize: normalizeAshby
  },
  governmentjobs: {
    kind: "governmentjobs",
    label: "GovernmentJobs / NEOGOV",
    normalize: normalizeGovernmentJobs
  },
  jobposting_jsonld: {
    kind: "jobposting_jsonld",
    label: "JobPosting JSON-LD",
    normalize: normalizeJsonLd
  },
  manual: {
    kind: "manual",
    label: "Manual JSON",
    normalize: normalizeManual
  }
};

export function normalizeWithAdapter(
  raw: unknown,
  source: JobSource
): { postings: NormalizedJobPosting[]; errors: string[] } {
  const adapter = getAdapterForKind(source.kind);
  if (!adapter) {
    return {
      postings: [],
      errors: [`Unsupported source kind "${source.kind}". Set a supported adapter kind before running.`]
    };
  }
  try {
    return { postings: adapter.normalize(raw, source), errors: [] };
  } catch {
    return { postings: [], errors: ["Failed to normalize source response."] };
  }
}
