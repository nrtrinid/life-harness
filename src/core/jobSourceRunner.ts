import { createId, nowIso } from "./ids";
import {
  isSupportedAdapterKind,
  GOVERNMENTJOBS_ZERO_LISTINGS_MESSAGE,
  WORKDAY_ZERO_LISTINGS_MESSAGE,
  countWorkdayRawJobEntries,
  normalizeWithAdapter,
  parseWorkdaySearchPayload,
  type NormalizedJobPosting
} from "./jobSourceAdapters";
import { createJobCandidate } from "./jobScout";
import {
  buildPaginatedPageSource,
  getWorkdayPaginationStartOffset,
  resolvePaginationDefaults,
  type PaginationStoppedReason
} from "./jobSourcePagination";
import { validateJobSourceRequestConfig } from "./jobSourceRequestConfig";
import type {
  JobCandidate,
  JobSource,
  JobSourceRunResult,
  JobSourceRunStatus,
  ResumeModule
} from "./types";

const DEFAULT_MAX_RESULTS = 25;

export const PREVIEW_JOB_SOURCE_ID = "job-source-preview";

export function buildTemporaryJobSource(input: {
  name: string;
  url: string;
  kind: JobSource["kind"];
  enabled?: boolean;
  cadence?: JobSource["cadence"];
  maxResults?: number;
  notes?: string;
  adapterNotes?: string;
  requestConfig?: JobSource["requestConfig"];
  id?: string;
}): JobSource {
  return {
    id: input.id ?? PREVIEW_JOB_SOURCE_ID,
    name: input.name.trim(),
    url: input.url.trim(),
    kind: input.kind,
    enabled: true,
    cadence: input.cadence ?? "manual",
    maxResults: input.maxResults ?? DEFAULT_MAX_RESULTS,
    notes: input.notes?.trim() || undefined,
    adapterNotes: input.adapterNotes?.trim() || undefined,
    requestConfig: input.requestConfig,
    runStatus: "idle"
  };
}

export function rebindJobSourceRunOutput(
  output: JobSourceRunOutput,
  source: JobSource
): JobSourceRunOutput {
  return {
    ...output,
    result: {
      ...output.result,
      sourceId: source.id
    },
    candidates: output.candidates.map((candidate) => ({
      ...candidate,
      sourceId: source.id
    }))
  };
}

export function isValidSourceUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/")) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function canRunJobSource(source: JobSource): { ok: boolean; reason?: string } {
  if (!source.enabled) {
    return { ok: false, reason: "Source is disabled." };
  }
  if (source.runStatus === "running") {
    return { ok: false, reason: "Source is already running." };
  }
  if (!isSupportedAdapterKind(source.kind)) {
    return {
      ok: false,
      reason: `Unsupported source kind "${source.kind}". Registry only — set a supported kind before running.`
    };
  }
  if (!isValidSourceUrl(source.url)) {
    return { ok: false, reason: "Source URL must be http(s) or a web fixture path." };
  }
  const configValidation = validateJobSourceRequestConfig(source.requestConfig);
  if (!configValidation.ok) {
    return { ok: false, reason: configValidation.error };
  }
  return { ok: true };
}

export function buildCandidateDedupeKey(input: {
  sourceUrl?: string;
  company?: string;
  roleTitle: string;
}): string {
  return [
    (input.sourceUrl ?? "").trim().toLowerCase(),
    (input.company ?? "").trim().toLowerCase(),
    input.roleTitle.trim().toLowerCase()
  ].join("|");
}

export function dedupeJobPostings(
  postings: NormalizedJobPosting[],
  existingCandidates: JobCandidate[]
): { unique: NormalizedJobPosting[]; skippedDuplicates: number } {
  const seen = new Set(
    existingCandidates.map((candidate) =>
      buildCandidateDedupeKey({
        sourceUrl: candidate.sourceUrl,
        company: candidate.company,
        roleTitle: candidate.roleTitle
      })
    )
  );
  const unique: NormalizedJobPosting[] = [];
  let skippedDuplicates = 0;

  for (const posting of postings) {
    const key = buildCandidateDedupeKey({
      sourceUrl: posting.sourceUrl,
      company: posting.company,
      roleTitle: posting.roleTitle
    });
    if (seen.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(posting);
  }

  return { unique, skippedDuplicates };
}

export function createCandidatesFromPostings(
  postings: NormalizedJobPosting[],
  source: JobSource,
  modules: ResumeModule[]
): JobCandidate[] {
  return postings.map((posting) =>
    createJobCandidate(
      {
        company: posting.company ?? source.name,
        roleTitle: posting.roleTitle,
        sourceUrl: posting.sourceUrl,
        location: posting.location,
        description: posting.description,
        roleType: posting.roleType ?? "other",
        sourceId: source.id,
        origin: "source_fetch"
      },
      modules,
      "new"
    )
  );
}

export interface JobSourceRunOutput {
  result: JobSourceRunResult;
  candidates: JobCandidate[];
  updatedSource: Pick<
    JobSource,
    "runStatus" | "lastRunAt" | "lastRunMessage" | "lastFetchedCount" | "lastCheckedAt"
  >;
}

export interface FinalizeJobSourceMeta {
  pagesFetched?: number;
  paginationStoppedReason?: PaginationStoppedReason;
}

export function finalizeJobSourceFromPostings(
  source: JobSource,
  normalized: NormalizedJobPosting[],
  existingCandidates: JobCandidate[],
  resumeModules: ResumeModule[],
  normalizeErrors: string[] = [],
  options?: { effectiveMaxResults?: number; meta?: FinalizeJobSourceMeta }
): JobSourceRunOutput {
  const fetchedAt = nowIso();
  const maxResults = options?.effectiveMaxResults ?? source.maxResults ?? DEFAULT_MAX_RESULTS;
  const capped = normalized.slice(0, maxResults);
  const { unique, skippedDuplicates } = dedupeJobPostings(capped, existingCandidates);
  const candidates = createCandidatesFromPostings(unique, source, resumeModules);
  const errors = [...normalizeErrors];
  const isGovernmentJobsWeakPass =
    source.kind === "governmentjobs" && normalized.length === 0 && normalizeErrors.length === 0;
  const isWorkdayWeakPass =
    source.kind === "workday" && normalized.length === 0 && normalizeErrors.length === 0;

  if (normalized.length === 0 && errors.length === 0 && !isGovernmentJobsWeakPass && !isWorkdayWeakPass) {
    errors.push("No supported public postings found at this URL.");
  }

  const runStatus: JobSourceRunStatus = errors.length > 0 ? "error" : "success";
  const paginationNote =
    options?.meta?.pagesFetched && options.meta.pagesFetched > 1
      ? ` Fetched ${options.meta.pagesFetched} pages.`
      : "";
  const message = isGovernmentJobsWeakPass
    ? GOVERNMENTJOBS_ZERO_LISTINGS_MESSAGE
    : isWorkdayWeakPass
      ? WORKDAY_ZERO_LISTINGS_MESSAGE
      : errors.length > 0
        ? errors[0]
        : candidates.length > 0
          ? `Found ${candidates.length} new candidate${candidates.length === 1 ? "" : "s"}. Skipped ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? "" : "s"}.${paginationNote}`
          : skippedDuplicates > 0
            ? `No new candidates. Skipped ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? "" : "s"}.${paginationNote}`
            : `Run completed with no new candidates.${paginationNote}`;

  return {
    result: {
      sourceId: source.id,
      fetchedAt,
      createdCandidateIds: candidates.map((candidate) => candidate.id),
      skippedDuplicates,
      errors,
      message,
      pagesFetched: options?.meta?.pagesFetched,
      paginationStoppedReason: options?.meta?.paginationStoppedReason
    },
    candidates,
    updatedSource: {
      runStatus,
      lastRunAt: fetchedAt,
      lastRunMessage: message,
      lastFetchedCount: candidates.length,
      lastCheckedAt: fetchedAt
    }
  };
}

export function runJobSourceFromRaw(
  source: JobSource,
  raw: unknown,
  existingCandidates: JobCandidate[],
  resumeModules: ResumeModule[]
): JobSourceRunOutput {
  const { postings: normalized, errors: normalizeErrors } = normalizeWithAdapter(raw, source);
  return finalizeJobSourceFromPostings(
    source,
    normalized,
    existingCandidates,
    resumeModules,
    normalizeErrors
  );
}

export type PaginatedFetchPageResult =
  | { ok: true; raw: unknown }
  | { ok: false; error: string };

export async function runPaginatedJobSourceFromRaw(
  source: JobSource,
  existingCandidates: JobCandidate[],
  resumeModules: ResumeModule[],
  fetchPage: (pageSource: JobSource) => Promise<PaginatedFetchPageResult>
): Promise<JobSourceRunOutput> {
  const { limit, maxPages, effectiveMaxResults } = resolvePaginationDefaults(source);
  const startOffset = getWorkdayPaginationStartOffset(source.requestConfig?.bodyJson);
  const accumulated: NormalizedJobPosting[] = [];
  let accumulatedRawCount = 0;
  let pagesFetched = 0;
  let stoppedReason: PaginationStoppedReason = "max_pages";
  let offset = startOffset;
  const errors: string[] = [];

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const pageSource = buildPaginatedPageSource(source, offset, limit);
    const fetched = await fetchPage(pageSource);
    if (!fetched.ok) {
      stoppedReason = "fetch_error";
      errors.push(fetched.error);
      if (pagesFetched === 0) {
        return buildFetchErrorRunOutput(source, fetched.error);
      }
      break;
    }

    pagesFetched += 1;
    const pageRawCount = countWorkdayRawJobEntries(fetched.raw);
    const pagePostings = parseWorkdaySearchPayload(fetched.raw, source);
    accumulated.push(...pagePostings);
    accumulatedRawCount += pageRawCount;

    if (pageRawCount === 0) {
      stoppedReason = "zero_postings";
      break;
    }
    if (pageRawCount < limit) {
      stoppedReason = "fewer_than_limit";
      break;
    }
    if (accumulatedRawCount >= effectiveMaxResults) {
      stoppedReason = "max_results";
      break;
    }
    if (pageIndex + 1 >= maxPages) {
      stoppedReason = "max_pages";
      break;
    }

    offset += limit;
  }

  const dedupedWithinRun = dedupeJobPostings(accumulated, []);
  return finalizeJobSourceFromPostings(
    source,
    dedupedWithinRun.unique,
    existingCandidates,
    resumeModules,
    errors,
    {
      effectiveMaxResults,
      meta: {
        pagesFetched,
        paginationStoppedReason: stoppedReason
      }
    }
  );
}

export function countSuccessfulManualSourceRuns(runs: JobSourceRunResult[]): number {
  return runs.filter((run) => run.errors.length === 0).length;
}

export function countFailedSourceRuns(runs: JobSourceRunResult[]): number {
  return runs.filter((run) => run.errors.length > 0).length;
}

export function countFetchedCandidates(candidates: JobCandidate[]): number {
  return candidates.filter((candidate) => candidate.origin === "source_fetch").length;
}

export function countApprovedFromSourceFetch(candidates: JobCandidate[]): number {
  return candidates.filter(
    (candidate) => candidate.origin === "source_fetch" && candidate.status === "card_created"
  ).length;
}

export function buildFetchErrorRunOutput(
  source: JobSource,
  errorMessage: string
): JobSourceRunOutput {
  const fetchedAt = nowIso();
  return {
    result: {
      sourceId: source.id,
      fetchedAt,
      createdCandidateIds: [],
      skippedDuplicates: 0,
      errors: [errorMessage],
      message: errorMessage
    },
    candidates: [],
    updatedSource: {
      runStatus: "error",
      lastRunAt: fetchedAt,
      lastRunMessage: errorMessage,
      lastFetchedCount: 0,
      lastCheckedAt: fetchedAt
    }
  };
}

export function parseFetchedRaw(source: JobSource, responseText: string): unknown {
  if (source.kind === "jobposting_jsonld" || source.kind === "governmentjobs") {
    return responseText;
  }
  if (source.kind === "workday") {
    try {
      return JSON.parse(responseText) as unknown;
    } catch {
      return responseText;
    }
  }
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

export const CORS_FETCH_ERROR_MESSAGE =
  "Fetch blocked — likely CORS. v0.3 has no backend proxy. Use the web fixture or a public CORS-friendly JSON URL.";
