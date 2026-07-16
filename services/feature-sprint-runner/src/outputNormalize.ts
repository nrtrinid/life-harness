/**
 * Normalize agent CLI stdout/stderr for capture and emptiness checks.
 * Confirmed Cursor `--output-format` values: text | json | stream-json (with `-p`).
 */

const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

export type NormalizedAgentOutput = {
  text: string;
  format: "text" | "json" | "stream-json" | "unknown";
  parseWarnings: string[];
};

function extractJsonText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["result", "text", "response", "message", "content"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key] as string;
    }
  }
  if (Array.isArray(record.content)) {
    const parts = record.content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string") {
          return (item as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  return undefined;
}

/**
 * Combine stdout/stderr, strip ANSI, and optionally unwrap JSON print format.
 * Does not fabricate content when parsing fails — keeps raw text.
 */
export function normalizeAgentCapturedOutput(
  stdout: string,
  stderr: string,
  outputFormat: "text" | "json" | "stream-json" | string = "text"
): NormalizedAgentOutput {
  const parseWarnings: string[] = [];
  const combined = [stdout, stderr].filter((part) => part.trim().length > 0).join("\n");
  const stripped = stripAnsi(combined).trim();

  if (!stripped) {
    return { text: "", format: "text", parseWarnings };
  }

  if (outputFormat === "json") {
    try {
      const parsed = JSON.parse(stripped) as unknown;
      const extracted = extractJsonText(parsed);
      if (extracted?.trim()) {
        return { text: extracted.trim(), format: "json", parseWarnings };
      }
      parseWarnings.push(
        "Cursor JSON output parsed but no known text field (result/text/response); using raw JSON."
      );
      return { text: stripped, format: "json", parseWarnings };
    } catch {
      parseWarnings.push("Cursor --output-format json produced non-JSON text; using raw stdout/stderr.");
      return { text: stripped, format: "unknown", parseWarnings };
    }
  }

  if (outputFormat === "stream-json") {
    // stream-json is line-delimited; keep raw for humans/history (do not invent aggregation).
    parseWarnings.push("stream-json format retained as raw capture (no aggregation).");
    return { text: stripped, format: "stream-json", parseWarnings };
  }

  return { text: stripped, format: "text", parseWarnings };
}

export function isWhitespaceOnly(text: string | undefined): boolean {
  return !text || text.trim().length === 0;
}
