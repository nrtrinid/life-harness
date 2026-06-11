import type { IncomingMessage } from "node:http";

export function resolveRunnerToken(): string | undefined {
  const token = process.env.FEATURE_SPRINT_RUNNER_TOKEN?.trim();
  return token || undefined;
}

export function extractBearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (!header || typeof header !== "string") {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

export function isAuthorizedRequest(request: IncomingMessage): boolean {
  const configured = resolveRunnerToken();
  if (!configured) {
    return true;
  }

  return extractBearerToken(request) === configured;
}
