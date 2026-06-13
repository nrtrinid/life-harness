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
  "workday",
  "icims",
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
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
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

const NON_SOFTWARE_ENGINEER_TITLE =
  /\b(civil|structural|mechanical|electrical|environmental|traffic|highway|water|sanitary|geotechnical|aerospace|biomedical|petroleum|chemical|industrial)\s+engineer\b/i;

const ROLE_KEYWORDS: Array<{ roleType: RoleType; pattern: RegExp }> = [
  { roleType: "cybersecurity", pattern: /\b(cyber|security|infosec|soc)\b/i },
  { roleType: "data_finance", pattern: /\b(data|finance|analyst|quant)\b/i },
  { roleType: "full_stack", pattern: /\b(full[\s-]?stack|frontend|backend)\b/i },
  {
    roleType: "software",
    pattern: /\b(software engineer|software developer|developer|programmer|swe)\b/i
  },
  { roleType: "it", pattern: /\b(it support|help desk|systems admin|devops)\b/i }
];

export function inferRoleType(title: string, description: string): RoleType {
  if (NON_SOFTWARE_ENGINEER_TITLE.test(title)) {
    return "other";
  }

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
  "No GovernmentJobs listings found for this agency. Check the careers URL or try again later.";

export const GOVERNMENTJOBS_LISTING_ORIGIN = "https://www.governmentjobs.com";

export function extractGovernmentJobsAgencySlug(sourceUrl: string): string | null {
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

export function resolveGovernmentJobsFetchUrl(sourceUrl: string): string {
  const trimmed = sourceUrl.trim();
  if (!trimmed || trimmed.startsWith("/fixtures/")) {
    return trimmed;
  }

  if (trimmed.includes("/careers/home/index")) {
    if (trimmed.startsWith("http")) {
      return trimmed;
    }
    return `${GOVERNMENTJOBS_LISTING_ORIGIN}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
  }

  const agency = extractGovernmentJobsAgencySlug(trimmed);
  if (!agency) {
    return trimmed;
  }

  return `${GOVERNMENTJOBS_LISTING_ORIGIN}/careers/home/index?agency=${encodeURIComponent(agency)}`;
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
  const agency = extractGovernmentJobsAgencySlug(source.url);
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

export const ICIMS_ZERO_LISTINGS_MESSAGE =
  "No iCIMS listings found at this URL. The portal may redirect outside iframe mode — use the *.icims.com search URL with in_iframe=1.";

export function extractIcimsTenantSlug(host: string): string | null {
  const normalized = host.toLowerCase();
  if (!normalized.includes("icims.com")) {
    return null;
  }
  const subdomain = normalized.split(".")[0] ?? "";
  const careersMatch = subdomain.match(/^careers-(.+)$/);
  if (careersMatch?.[1]) {
    return careersMatch[1];
  }
  const jobsMatch = subdomain.match(/^jobs(?:\d+)?-(.+)$/);
  if (jobsMatch?.[1]) {
    return jobsMatch[1];
  }
  const jobseuropeMatch = subdomain.match(/^jobseurope-(.+)$/);
  if (jobseuropeMatch?.[1]) {
    return jobseuropeMatch[1];
  }
  return subdomain || null;
}

function buildIcimsSearchUrl(origin: string): string {
  const url = new URL(`${origin.replace(/\/$/, "")}/jobs/search`);
  url.searchParams.set("ss", "1");
  url.searchParams.set("in_iframe", "1");
  return url.href;
}

export function resolveIcimsFetchUrl(sourceUrl: string): string {
  const trimmed = sourceUrl.trim();
  if (!trimmed || trimmed.startsWith("/fixtures/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname.toLowerCase().includes("icims.com")) {
      return trimmed;
    }

    if (parsed.pathname.toLowerCase().includes("/jobs/search")) {
      parsed.searchParams.set("ss", "1");
      parsed.searchParams.set("in_iframe", "1");
      return parsed.href;
    }

    return buildIcimsSearchUrl(parsed.origin);
  } catch {
    return trimmed;
  }
}

function isIcimsJobDetailPath(href: string): boolean {
  let pathname = href;
  try {
    pathname = href.startsWith("http") ? new URL(href).pathname : href.split("?")[0] ?? href;
  } catch {
    return false;
  }
  return /\/jobs\/\d+\//i.test(pathname);
}

function resolveIcimsHref(href: string, sourceUrl: string): string {
  try {
    const base = sourceUrl.startsWith("http")
      ? sourceUrl
      : "https://example.icims.com/jobs/search";
    const origin = new URL(base).origin;
    return new URL(href, origin).href;
  } catch {
    return href;
  }
}

function extractIcimsTitleFromAnchor(anchorHtml: string, titleAttr?: string): string {
  if (titleAttr?.trim()) {
    const stripped = titleAttr.replace(/^\d+\s*-\s*/, "").trim();
    if (stripped) {
      return stripped;
    }
  }
  const h3Match = anchorHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (h3Match?.[1]) {
    const text = stripHtml(h3Match[1]);
    if (text) {
      return text;
    }
  }
  return stripHtml(anchorHtml);
}

function extractIcimsLocationFromBlock(block: string): string | undefined {
  const locationMatch = block.match(
    /<div[^>]*class=["'][^"']*\bheader\b[^"']*\bleft\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i
  );
  if (locationMatch?.[1]) {
    const text = stripHtml(locationMatch[1]);
    return text || undefined;
  }
  return undefined;
}

function extractIcimsSnippetFromBlock(block: string): string | undefined {
  const snippetMatch = block.match(
    /<div[^>]*class=["'][^"']*\bdescription\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  if (snippetMatch?.[1]) {
    const text = stripHtml(snippetMatch[1]);
    return text || undefined;
  }
  return undefined;
}

function composeIcimsDescription(input: {
  roleTitle: string;
  location?: string;
  snippet?: string;
}): string {
  const lines = [`Title: ${input.roleTitle}`];
  if (input.location) {
    lines.push(`Location: ${input.location}`);
  }
  if (input.snippet) {
    lines.push(`Snippet: ${input.snippet}`);
  }
  return truncateDescription(lines.join("\n"));
}

function buildIcimsPosting(input: {
  roleTitle: string;
  sourceUrl?: string;
  location?: string;
  snippet?: string;
  company: string;
}): NormalizedJobPosting {
  const description = composeIcimsDescription(input);
  return {
    company: input.company,
    roleTitle: input.roleTitle,
    sourceUrl: input.sourceUrl,
    location: input.location,
    description,
    roleType: inferRoleType(input.roleTitle, description)
  };
}

function resolveIcimsCompanyName(sourceName: string): string {
  return sourceName.replace(/\s*[—-]?\s*(Careers|Jobs|iCIMS)\s*$/i, "").trim();
}

export function parseIcimsListingHtml(html: string, source: JobSource): NormalizedJobPosting[] {
  const company = resolveIcimsCompanyName(source.name);
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

  for (const blockMatch of html.matchAll(
    /<li[^>]*class=["'][^"']*row[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi
  )) {
    const block = blockMatch[1] ?? "";
    const anchorMatch =
      block.match(
        /<a[^>]*class=["'][^"']*iCIMS_Anchor[^"']*["'][^>]*href=["']([^"']+)["'][^>]*(?:title=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/a>/i
      ) ??
      block.match(
        /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*iCIMS_Anchor[^"']*["'][^>]*(?:title=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/a>/i
      );
    if (!anchorMatch) {
      continue;
    }
    const href = anchorMatch[1] ?? "";
    if (!isIcimsJobDetailPath(href)) {
      continue;
    }
    const roleTitle = extractIcimsTitleFromAnchor(anchorMatch[3] ?? "", anchorMatch[2]);
    if (!roleTitle) {
      continue;
    }
    addPosting(
      buildIcimsPosting({
        roleTitle,
        sourceUrl: resolveIcimsHref(href, source.url),
        location: extractIcimsLocationFromBlock(block),
        snippet: extractIcimsSnippetFromBlock(block),
        company
      })
    );
  }

  for (const match of html.matchAll(
    /<a[^>]*href=["']([^"']+)["'][^>]*(?:title=["']([^"']*)["'])?[^>]*class=["'][^"']*iCIMS_Anchor[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi
  )) {
    const href = match[1] ?? "";
    if (!isIcimsJobDetailPath(href)) {
      continue;
    }
    const roleTitle = extractIcimsTitleFromAnchor(match[3] ?? "", match[2]);
    if (!roleTitle) {
      continue;
    }
    addPosting(
      buildIcimsPosting({
        roleTitle,
        sourceUrl: resolveIcimsHref(href, source.url),
        company
      })
    );
  }

  for (const match of html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1] ?? "";
    if (!isIcimsJobDetailPath(href)) {
      continue;
    }
    const roleTitle = stripHtml(match[2] ?? "");
    if (!roleTitle || roleTitle.length < 3) {
      continue;
    }
    addPosting(
      buildIcimsPosting({
        roleTitle,
        sourceUrl: resolveIcimsHref(href, source.url),
        company
      })
    );
  }

  return [...deduped.values()];
}

function normalizeIcims(raw: unknown, source: JobSource): NormalizedJobPosting[] {
  const html = typeof raw === "string" ? raw : "";
  if (!html.trim()) {
    return [];
  }
  if (html.includes("window.top.location.href")) {
    return [];
  }
  return parseIcimsListingHtml(html, source);
}

export const WORKDAY_ZERO_LISTINGS_MESSAGE =
  "No supported Workday postings found at this URL/payload. This source may need endpoint discovery or a different Workday site path.";

function resolveWorkdayBaseUrl(sourceUrl: string): string {
  if (sourceUrl.startsWith("http")) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.pathname.toLowerCase().includes("/wday/cxs/")) {
        return parsed.origin;
      }
      return sourceUrl;
    } catch {
      return sourceUrl;
    }
  }
  if (sourceUrl.startsWith("/")) {
    return `https://example.myworkdayjobs.com${sourceUrl}`;
  }
  return `https://example.myworkdayjobs.com/${sourceUrl}`;
}

function resolveWorkdayHref(href: string, sourceUrl: string): string {
  const base = resolveWorkdayBaseUrl(sourceUrl);
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function firstWorkdayString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function looksLikeWorkdayJob(item: unknown): boolean {
  const record = asRecord(item);
  if (!record) {
    return false;
  }
  return Boolean(
    firstWorkdayString(record, ["title", "jobTitle", "name", "externalTitle"]) &&
      (firstWorkdayString(record, ["externalPath", "externalUrl", "jobPostingUrl", "href", "path"]) ||
        firstWorkdayString(record, ["title", "jobTitle"]))
  );
}

function collectWorkdayJobArrays(value: unknown, depth: number, collected: unknown[][]): void {
  if (depth > 2) {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => looksLikeWorkdayJob(item) || asRecord(item))) {
      if (value.some((item) => looksLikeWorkdayJob(item))) {
        collected.push(value);
      }
    }
    for (const item of value) {
      collectWorkdayJobArrays(item, depth + 1, collected);
    }
    return;
  }
  const record = asRecord(value);
  if (!record) {
    return;
  }
  for (const key of [
    "jobPostings",
    "jobs",
    "data",
    "children",
    "results",
    "body",
    "jobSearchPageData"
  ]) {
    collectWorkdayJobArrays(record[key], depth + 1, collected);
  }
}

function extractWorkdayJobArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  const record = asRecord(raw);
  if (!record) {
    return [];
  }

  const nestedCandidates: unknown[][] = [];
  collectWorkdayJobArrays(raw, 0, nestedCandidates);

  for (const key of ["jobPostings", "jobs", "data", "children", "results"]) {
    const value = record[key];
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }

  const body = asRecord(record.body);
  if (body) {
    for (const key of ["jobPostings", "children"]) {
      const value = body[key];
      if (Array.isArray(value) && value.length > 0) {
        return value;
      }
    }
  }

  const jobSearchPageData = asRecord(record.jobSearchPageData);
  if (Array.isArray(jobSearchPageData?.jobs) && jobSearchPageData.jobs.length > 0) {
    return jobSearchPageData.jobs;
  }

  for (const candidate of nestedCandidates) {
    if (candidate.length > 0) {
      return candidate;
    }
  }

  for (const key of ["jobPostings", "jobs", "data", "children", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function composeWorkdayDescription(input: {
  roleTitle: string;
  location?: string;
  department?: string;
  jobFamily?: string;
  jobType?: string;
  postedOn?: string;
  jobReqId?: string;
  summary?: string;
}): string {
  const lines = [`Title: ${input.roleTitle}`];
  if (input.location) {
    lines.push(`Location: ${input.location}`);
  }
  if (input.department) {
    lines.push(`Department: ${input.department}`);
  } else if (input.jobFamily) {
    lines.push(`Department: ${input.jobFamily}`);
  }
  if (input.jobType) {
    lines.push(`Job Type: ${input.jobType}`);
  }
  if (input.postedOn) {
    lines.push(`Posted: ${input.postedOn}`);
  }
  if (input.jobReqId) {
    lines.push(`Req ID: ${input.jobReqId}`);
  }
  if (input.summary) {
    lines.push(`Summary: ${input.summary}`);
  }
  return truncateDescription(lines.join("\n"));
}

function normalizeWorkdayJob(
  job: unknown,
  source: JobSource,
  company: string
): NormalizedJobPosting | undefined {
  const record = asRecord(job);
  if (!record) {
    return undefined;
  }

  const roleTitle = firstWorkdayString(record, ["title", "jobTitle", "name", "externalTitle"]);
  if (!roleTitle) {
    return undefined;
  }

  const href = firstWorkdayString(record, [
    "externalPath",
    "externalUrl",
    "jobPostingUrl",
    "href",
    "path"
  ]);
  const sourceUrl = href ? resolveWorkdayHref(href, source.url) : undefined;

  const location = firstWorkdayString(record, [
    "locationsText",
    "location",
    "locations",
    "primaryLocation",
    "jobLocation"
  ]);

  const department =
    firstWorkdayString(record, ["department", "jobFamily"]) ??
    firstWorkdayString(record, ["jobFamily"]);

  const jobType =
    firstWorkdayString(record, ["timeType", "jobType", "workerSubType"]) ??
    firstWorkdayString(record, ["workerSubType"]);

  const postedOn = firstWorkdayString(record, ["postedOn", "postedDate"]);
  const jobReqId = firstWorkdayString(record, ["jobReqId", "requisitionId"]);

  let summary = firstWorkdayString(record, ["description", "summary"]);
  const bullets = record.bulletFields;
  if (Array.isArray(bullets)) {
    const bulletText = bullets
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item))
      .join(" ");
    if (bulletText) {
      summary = summary ? `${summary} ${bulletText}` : bulletText;
    }
  }

  const description = composeWorkdayDescription({
    roleTitle,
    location,
    department,
    jobType,
    postedOn,
    jobReqId,
    summary
  });

  return {
    company,
    roleTitle,
    sourceUrl,
    location,
    description,
    roleType: inferRoleType(roleTitle, description)
  };
}

export function countWorkdayRawJobEntries(raw: unknown): number {
  return extractWorkdayJobArray(raw).length;
}

function resolveWorkdayCompanyName(sourceName: string): string {
  return sourceName.replace(/\s*[—-]?\s*(Careers|Jobs|External Site|Workday CXS)\s*$/i, "").trim();
}

export function parseWorkdaySearchPayload(raw: unknown, source: JobSource): NormalizedJobPosting[] {
  const company = resolveWorkdayCompanyName(source.name);
  const deduped = new Map<string, NormalizedJobPosting>();

  for (const job of extractWorkdayJobArray(raw)) {
    const posting = normalizeWorkdayJob(job, source, company);
    if (!posting) {
      continue;
    }
    const key = `${(posting.sourceUrl ?? "").toLowerCase()}|${posting.roleTitle.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, posting);
    }
  }

  return [...deduped.values()];
}

function normalizeWorkday(raw: unknown, source: JobSource): NormalizedJobPosting[] {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("<")) {
      return [];
    }
    try {
      return parseWorkdaySearchPayload(JSON.parse(trimmed) as unknown, source);
    } catch {
      return [];
    }
  }
  return parseWorkdaySearchPayload(raw, source);
}

const ADAPTERS: Record<
  | "greenhouse"
  | "lever"
  | "ashby"
  | "governmentjobs"
  | "workday"
  | "icims"
  | "jobposting_jsonld"
  | "manual",
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
  workday: {
    kind: "workday",
    label: "Workday / MyWorkdayJobs",
    normalize: normalizeWorkday
  },
  icims: {
    kind: "icims",
    label: "iCIMS Career Portal",
    normalize: normalizeIcims
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
