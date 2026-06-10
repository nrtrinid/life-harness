import type { JobSource, JobSourcePaginationConfig, JobSourceRequestConfig } from "./types";

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_DEFAULT_MAX_PAGES = 3;
export const PAGINATION_DEFAULT_MAX_RESULTS = 50;
export const PAGINATION_MIN_LIMIT = 1;
export const PAGINATION_MAX_LIMIT = 50;
export const PAGINATION_MIN_MAX_PAGES = 1;
export const PAGINATION_MAX_MAX_PAGES = 5;

export type PaginationStoppedReason =
  | "fewer_than_limit"
  | "zero_postings"
  | "max_pages"
  | "max_results"
  | "fetch_error";

export interface ResolvedPaginationDefaults {
  limit: number;
  maxPages: number;
  effectiveMaxResults: number;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function resolveEffectiveMaxResults(source: JobSource): number {
  return (
    source.requestConfig?.pagination?.maxResults ??
    source.maxResults ??
    PAGINATION_DEFAULT_MAX_RESULTS
  );
}

export function normalizePaginationConfig(
  pagination: JobSourcePaginationConfig | undefined,
  source: JobSource
): JobSourcePaginationConfig | undefined {
  if (!pagination || pagination.mode === "none") {
    return undefined;
  }
  if (pagination.mode !== "workday_offset") {
    return pagination;
  }
  return {
    mode: "workday_offset",
    limit: clampInt(pagination.limit ?? PAGINATION_DEFAULT_LIMIT, PAGINATION_MIN_LIMIT, PAGINATION_MAX_LIMIT),
    maxPages: clampInt(
      pagination.maxPages ?? PAGINATION_DEFAULT_MAX_PAGES,
      PAGINATION_MIN_MAX_PAGES,
      PAGINATION_MAX_MAX_PAGES
    ),
    maxResults: pagination.maxResults
  };
}

export function resolvePaginationDefaults(source: JobSource): ResolvedPaginationDefaults {
  const pagination = normalizePaginationConfig(source.requestConfig?.pagination, source);
  return {
    limit: pagination?.limit ?? PAGINATION_DEFAULT_LIMIT,
    maxPages: pagination?.maxPages ?? PAGINATION_DEFAULT_MAX_PAGES,
    effectiveMaxResults: resolveEffectiveMaxResults(source)
  };
}

export function shouldUseWorkdayPagination(source: JobSource): boolean {
  return source.requestConfig?.pagination?.mode === "workday_offset";
}

export function buildWorkdayPageBody(
  bodyJson: Record<string, unknown>,
  offset: number,
  limit: number
): Record<string, unknown> {
  return {
    ...bodyJson,
    limit,
    offset
  };
}

export function getWorkdayPaginationStartOffset(bodyJson: unknown): number {
  if (!bodyJson || typeof bodyJson !== "object" || Array.isArray(bodyJson)) {
    return 0;
  }
  const offset = (bodyJson as Record<string, unknown>).offset;
  return typeof offset === "number" && Number.isFinite(offset) && offset >= 0
    ? Math.trunc(offset)
    : 0;
}

export function buildPaginatedPageSource(source: JobSource, offset: number, limit: number): JobSource {
  const bodyJson = source.requestConfig?.bodyJson;
  if (!bodyJson || typeof bodyJson !== "object" || Array.isArray(bodyJson)) {
    return source;
  }
  return {
    ...source,
    requestConfig: {
      ...source.requestConfig!,
      bodyJson: buildWorkdayPageBody(bodyJson as Record<string, unknown>, offset, limit)
    }
  };
}

export function validatePaginationConfig(
  config: JobSourceRequestConfig | undefined
): { ok: true } | { ok: false; error: string } {
  if (!config?.pagination || config.pagination.mode === "none") {
    return { ok: true };
  }
  if (config.pagination.mode !== "workday_offset") {
    return { ok: false, error: "Unsupported pagination mode." };
  }
  if (config.method !== "POST") {
    return { ok: false, error: "Workday pagination requires POST." };
  }
  if (
    config.bodyJson === undefined ||
    typeof config.bodyJson !== "object" ||
    config.bodyJson === null ||
    Array.isArray(config.bodyJson)
  ) {
    return { ok: false, error: "Workday pagination requires a JSON object body." };
  }
  const { limit, maxPages } = config.pagination;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < PAGINATION_MIN_LIMIT)) {
    return { ok: false, error: `Pagination limit must be at least ${PAGINATION_MIN_LIMIT}.` };
  }
  if (limit !== undefined && limit > PAGINATION_MAX_LIMIT) {
    return { ok: false, error: `Pagination limit must be at most ${PAGINATION_MAX_LIMIT}.` };
  }
  if (
    maxPages !== undefined &&
    (!Number.isInteger(maxPages) || maxPages < PAGINATION_MIN_MAX_PAGES)
  ) {
    return {
      ok: false,
      error: `Pagination maxPages must be at least ${PAGINATION_MIN_MAX_PAGES}.`
    };
  }
  if (maxPages !== undefined && maxPages > PAGINATION_MAX_MAX_PAGES) {
    return {
      ok: false,
      error: `Pagination maxPages must be at most ${PAGINATION_MAX_MAX_PAGES}.`
    };
  }
  if (
    config.pagination.maxResults !== undefined &&
    (!Number.isInteger(config.pagination.maxResults) || config.pagination.maxResults < 1)
  ) {
    return { ok: false, error: "Pagination maxResults must be a positive integer." };
  }
  return { ok: true };
}
