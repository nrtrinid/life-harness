import dns from "node:dns/promises";
import path from "node:path";

import { fileURLToPath } from "node:url";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 20_000;

export type DnsResolver = (hostname: string) => Promise<string[]>;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(moduleDir, "../../..");
export const FIXTURES_DIR = path.join(REPO_ROOT, "public", "fixtures");

function parseIpv4Octets(address: string): number[] | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return undefined;
  }
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }
  return octets;
}

function isBlockedIpv4(address: string): boolean {
  const octets = parseIpv4Octets(address);
  if (!octets) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10) {
    return true;
  }
  if (a === 127) {
    return true;
  }
  if (a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return false;
}

function expandIpv6(address: string): string | undefined {
  const lower = address.toLowerCase();
  if (!lower.includes("::")) {
    return lower;
  }
  const [head, tail] = lower.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0) {
    return undefined;
  }
  return [...headParts, ...Array(missing).fill("0"), ...tailParts].join(":");
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1") {
    return true;
  }
  if (normalized.startsWith("fe80:")) {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  const mappedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedMatch?.[1] && isBlockedIpv4(mappedMatch[1])) {
    return true;
  }
  const expanded = expandIpv6(normalized);
  if (!expanded) {
    return false;
  }
  const first = expanded.split(":")[0] ?? "";
  if (first.startsWith("fe8") || first.startsWith("fe9") || first.startsWith("fea") || first.startsWith("feb")) {
    return true;
  }
  if (first.startsWith("fc") || first.startsWith("fd")) {
    return true;
  }
  return false;
}

export function isBlockedIp(address: string): boolean {
  if (address.includes(":")) {
    return isBlockedIpv6(address);
  }
  return isBlockedIpv4(address);
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(lower)) {
    return true;
  }
  if (lower.endsWith(".localhost")) {
    return true;
  }
  if (isBlockedIpv4(lower)) {
    return true;
  }
  return false;
}

export async function defaultDnsResolve(hostname: string): Promise<string[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => entry.address);
}

export function resolveFixturePath(url: string): { ok: true; filePath: string } | { ok: false; error: string } {
  if (!url.startsWith("/fixtures/")) {
    return { ok: false, error: "Fixture URL must start with /fixtures/." };
  }
  const relative = url.slice("/fixtures/".length);
  if (!relative || relative.includes("..") || relative.includes("\\") || relative.includes("/")) {
    return { ok: false, error: "Invalid fixture path." };
  }
  const filePath = path.resolve(FIXTURES_DIR, relative);
  if (!filePath.startsWith(FIXTURES_DIR + path.sep) && filePath !== FIXTURES_DIR) {
    return { ok: false, error: "Fixture path escapes allowed directory." };
  }
  return { ok: true, filePath };
}

export type UrlSafetyResult =
  | { ok: true; mode: "fixture"; filePath: string }
  | { ok: true; mode: "network"; url: string; resolvedAddresses: string[] }
  | { ok: false; error: string };

export async function assertUrlSafeForFetch(
  url: string,
  resolveHost: DnsResolver = defaultDnsResolve
): Promise<UrlSafetyResult> {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, error: "Source URL is required." };
  }

  if (trimmed.startsWith("/fixtures/")) {
    const fixture = resolveFixturePath(trimmed);
    if (!fixture.ok) {
      return fixture;
    }
    return { ok: true, mode: "fixture", filePath: fixture.filePath };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Source URL must be http(s) or a /fixtures/ path." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are allowed." };
  }

  const hostname = parsed.hostname;
  if (isBlockedHostname(hostname)) {
    return { ok: false, error: `Blocked URL hostname: ${hostname}.` };
  }

  let resolvedAddresses: string[];
  try {
    resolvedAddresses = await resolveHost(hostname);
  } catch {
    return { ok: false, error: `DNS lookup failed for ${hostname}.` };
  }

  if (resolvedAddresses.length === 0) {
    return { ok: false, error: `DNS lookup returned no addresses for ${hostname}.` };
  }

  for (const address of resolvedAddresses) {
    if (isBlockedIp(address)) {
      return {
        ok: false,
        error: `Blocked URL target: ${hostname} resolves to private/internal address ${address}.`
      };
    }
  }

  return { ok: true, mode: "network", url: parsed.toString(), resolvedAddresses };
}
