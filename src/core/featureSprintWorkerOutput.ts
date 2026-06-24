import type {
  HarnessFeatureSprintWorkerOutputEvidence,
  HarnessFeatureSprintWorkerOutputSource
} from "./types";

export const FEATURE_WORKER_OUTPUT_FENCE = "feature-worker-output";
export const FEATURE_SPRINT_WORKER_OUTPUT_TEST_OUTPUT_MAX = 2_000;
const FEATURE_SPRINT_REVIEW_PACKET_MAX_FILES = 20;
const FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS = 12;
const FEATURE_SPRINT_REVIEW_PACKET_RAW_EXCERPT_MAX = 4_000;
function capStringListForReviewPacket(
  items: string[],
  maxItems: number
): { lines: string[]; truncated: boolean } {
  const cleaned = cleanStringList(items);
  if (cleaned.length <= maxItems) {
    return { lines: cleaned, truncated: false };
  }
  return {
    lines: [...cleaned.slice(0, maxItems), `… and ${cleaned.length - maxItems} more`],
    truncated: true
  };
}

function capRawOutputExcerptForReviewPacket(rawOutput: string): string {
  const trimmed = rawOutput.trim();
  if (trimmed.length <= FEATURE_SPRINT_REVIEW_PACKET_RAW_EXCERPT_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, FEATURE_SPRINT_REVIEW_PACKET_RAW_EXCERPT_MAX)}\n\n[raw output truncated for review packet]`;
}

export const WORKER_OUTPUT_MALFORMED_FENCE_WARNING =
  "Malformed feature-worker-output fence detected; used free-text fallback.";
export const WORKER_OUTPUT_NO_TESTS_WARNING = "No tests detected in worker output.";
export const WORKER_OUTPUT_SECRET_REDACTION_WARNING =
  "Potential secret-like text was redacted from worker output.";

export type FeatureSprintWorkerOutputImport = {
  source?: HarnessFeatureSprintWorkerOutputSource;
  summary?: string;
  changedFiles?: string[];
  testsRun?: string[];
  testOutput?: string;
  verificationCommands?: string[];
  warnings?: string[];
  knownLimitations?: string[];
  risks?: string[];
  diffStat?: string;
  withinScope?: boolean;
  scopeNotes?: string[];
  rawOutput?: string;
};

export type ParseFeatureSprintWorkerOutputOptions = {
  source?: HarnessFeatureSprintWorkerOutputSource;
  fallbackChangedFiles?: string[];
  fallbackVerificationCommands?: string[];
  now?: Date;
};

const SECRET_PATTERNS: RegExp[] = [
  /SUPABASE_SERVICE_ROLE/i,
  /service_role/i,
  /\bapi_key\b/i,
  /DISCORD_WEBHOOK/i,
  /\.env\b/i,
  /\bsk-[a-zA-Z0-9]{10,}/,
  /\bghp_[a-zA-Z0-9]{20,}/,
  /\bAKIA[0-9A-Z]{16}/,
  /\b(secret|token|password|authorization|bearer)\s*[:=]\s*['"]?[a-zA-Z0-9_\-./]{8,}/i,
  /\b(key|token)\s*=\s*[a-zA-Z0-9_\-./]{12,}/i,
  /\b[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN)\s*=\s*\S+/i
];

const SCOPE_PHRASE_PATTERNS: RegExp[] = [
  /out of scope/i,
  /not implemented/i,
  /follow[- ]?up/i,
  /could not verify/i,
  /environment unavailable/i,
  /\bnot run\b/i,
  /could not run/i
];

const SECTION_HEADERS: Record<string, RegExp> = {
  summary: /^summary:?\s*$/i,
  changedFiles: /^(files changed|changed files):?\s*$/i,
  tests: /^(tests|tests run|tests run:):?\s*$/i,
  verification: /^verification:?\s*$/i,
  warnings: /^warnings:?\s*$/i,
  knownLimitations: /^(known limitations|limitations):?\s*$/i,
  risks: /^risks:?\s*$/i,
  diffStat: /^(diff stat|diffstat):?\s*$/i,
  testOutput: /^(test output|test output:):?\s*$/i
};

function cleanStringList(items: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items ?? []) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function normalizePathish(file: string): string {
  return file.trim().replace(/^\.\//, "");
}

function capText(value: string | undefined, max: number): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}\n[truncated]`;
}

function coerceStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length > 0 ? cleanStringList(items) : undefined;
}

function coerceSource(value: unknown): HarnessFeatureSprintWorkerOutputSource | undefined {
  if (
    value === "cursor_auto" ||
    value === "cursor_agent" ||
    value === "manual" ||
    value === "runner" ||
    value === "mock"
  ) {
    return value;
  }
  return undefined;
}

function resolveNow(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function hasWorkerOutputFenceAttempt(text: string): boolean {
  return new RegExp(`\`\`\`${FEATURE_WORKER_OUTPUT_FENCE}`, "i").test(text);
}

function parseCompactListLine(line: string): string[] {
  const colonMatch = line.match(/^[^:]+:\s*(.+)$/);
  if (!colonMatch?.[1]) {
    return [];
  }
  return colonMatch[1]
    .split(/[,;]/)
    .map((item) => normalizePathish(item))
    .filter(Boolean);
}

function parseBulletOrLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("- ")) {
    return trimmed.slice(2).trim();
  }
  if (trimmed.startsWith("* ")) {
    return trimmed.slice(2).trim();
  }
  return trimmed;
}

export type WorkerOutputFreeTextSections = {
  summary?: string;
  changedFiles: string[];
  testsRun: string[];
  verificationCommands: string[];
  warnings: string[];
  knownLimitations: string[];
  risks: string[];
  diffStat?: string;
  testOutput?: string;
  scopeNotes: string[];
  withinScope?: boolean;
};

export function parseWorkerOutputFreeTextSections(rawOutput: string): WorkerOutputFreeTextSections {
  const sections: WorkerOutputFreeTextSections = {
    changedFiles: [],
    testsRun: [],
    verificationCommands: [],
    warnings: [],
    knownLimitations: [],
    risks: [],
    scopeNotes: []
  };

  let currentSection: keyof typeof SECTION_HEADERS | "none" = "none";
  const summaryLines: string[] = [];
  const testOutputLines: string[] = [];
  const diffStatLines: string[] = [];

  const lines = rawOutput.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let matchedSection: keyof typeof SECTION_HEADERS | undefined;
    for (const [key, pattern] of Object.entries(SECTION_HEADERS)) {
      if (pattern.test(trimmed) || pattern.test(trimmed.replace(/^#+\s*/, ""))) {
        matchedSection = key as keyof typeof SECTION_HEADERS;
        break;
      }
    }

    if (matchedSection) {
      currentSection = matchedSection;
      const inlineList = parseCompactListLine(trimmed);
      if (inlineList.length > 0 && matchedSection === "changedFiles") {
        sections.changedFiles.push(...inlineList);
      }
      if (inlineList.length > 0 && matchedSection === "tests") {
        sections.testsRun.push(...inlineList);
      }
      continue;
    }

    if (/^(changed files|files changed):/i.test(trimmed)) {
      sections.changedFiles.push(...parseCompactListLine(trimmed));
      currentSection = "changedFiles";
      continue;
    }

    if (/^(tests run|tests):/i.test(trimmed)) {
      sections.testsRun.push(...parseCompactListLine(trimmed));
      currentSection = "tests";
      continue;
    }

    if (/^## verification/i.test(trimmed)) {
      currentSection = "verification";
      continue;
    }

    if (/^(worktree:|branch:|git status:)/i.test(trimmed)) {
      currentSection = "none";
      continue;
    }

    const bullet = parseBulletOrLine(line);
    if (!bullet) {
      continue;
    }

    if (currentSection === "summary") {
      summaryLines.push(bullet);
      continue;
    }
    if (currentSection === "changedFiles") {
      sections.changedFiles.push(normalizePathish(bullet));
      continue;
    }
    if (currentSection === "tests" || currentSection === "verification") {
      if (/^status:/i.test(bullet)) {
        continue;
      }
      const commandMatch = bullet.match(/^command:\s*(.+)$/i);
      const command = commandMatch?.[1]?.trim() ?? bullet.replace(/\s+[—–-]\s*(pass|fail|passed|failed|✓|✗|skipped|not run).*$/i, "").trim();
      if (command) {
        if (currentSection === "verification") {
          sections.verificationCommands.push(command);
        }
        sections.testsRun.push(command);
      }
      if (/not run|could not run|environment unavailable|fail/i.test(bullet)) {
        sections.warnings.push(bullet);
      }
      continue;
    }
    if (currentSection === "warnings") {
      sections.warnings.push(bullet);
      continue;
    }
    if (currentSection === "knownLimitations") {
      sections.knownLimitations.push(bullet);
      continue;
    }
    if (currentSection === "risks") {
      sections.risks.push(bullet);
      continue;
    }
    if (currentSection === "diffStat") {
      diffStatLines.push(bullet);
      continue;
    }
    if (currentSection === "testOutput") {
      testOutputLines.push(bullet);
      continue;
    }

    for (const pattern of SCOPE_PHRASE_PATTERNS) {
      if (pattern.test(bullet)) {
        sections.scopeNotes.push(bullet);
        sections.withinScope = false;
      }
    }
  }

  if (summaryLines.length > 0) {
    sections.summary = summaryLines.join("\n").trim();
  }
  if (diffStatLines.length > 0) {
    sections.diffStat = diffStatLines.join("\n").trim();
  }
  if (testOutputLines.length > 0) {
    sections.testOutput = testOutputLines.join("\n").trim();
  }

  sections.changedFiles = cleanStringList(sections.changedFiles.map(normalizePathish));
  sections.testsRun = cleanStringList(sections.testsRun);
  sections.verificationCommands = cleanStringList(sections.verificationCommands);
  sections.warnings = cleanStringList(sections.warnings);
  sections.knownLimitations = cleanStringList(sections.knownLimitations);
  sections.risks = cleanStringList(sections.risks);
  sections.scopeNotes = cleanStringList(sections.scopeNotes);

  return sections;
}

export function parseFeatureWorkerOutputBlock(text: string): FeatureSprintWorkerOutputImport | null {
  const pattern = new RegExp(
    `\`\`\`${FEATURE_WORKER_OUTPUT_FENCE}\\s*\\n([\\s\\S]*?)\\n\`\`\``,
    "i"
  );
  const match = pattern.exec(text);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const source = coerceSource(parsed.source);
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : undefined;
    const rawOutput = typeof parsed.rawOutput === "string" ? parsed.rawOutput.trim() : undefined;
    const diffStat = typeof parsed.diffStat === "string" ? parsed.diffStat.trim() : undefined;
    const testOutput = typeof parsed.testOutput === "string" ? parsed.testOutput.trim() : undefined;
    const withinScope = typeof parsed.withinScope === "boolean" ? parsed.withinScope : undefined;

    const importValue: FeatureSprintWorkerOutputImport = {
      source,
      summary,
      changedFiles: coerceStringArray(parsed.changedFiles),
      testsRun: coerceStringArray(parsed.testsRun),
      testOutput,
      verificationCommands: coerceStringArray(parsed.verificationCommands),
      warnings: coerceStringArray(parsed.warnings),
      knownLimitations: coerceStringArray(parsed.knownLimitations),
      risks: coerceStringArray(parsed.risks),
      diffStat,
      withinScope,
      scopeNotes: coerceStringArray(parsed.scopeNotes),
      rawOutput
    };

    const hasField =
      summary ||
      rawOutput ||
      importValue.changedFiles?.length ||
      importValue.testsRun?.length ||
      importValue.warnings?.length;

    return hasField ? importValue : null;
  } catch {
    return null;
  }
}

function mapImportToEvidence(
  rawOutput: string,
  importValue: FeatureSprintWorkerOutputImport,
  options: ParseFeatureSprintWorkerOutputOptions
): HarnessFeatureSprintWorkerOutputEvidence {
  const capturedAt = resolveNow(options.now);
  const warnings = cleanStringList(importValue.warnings);

  let testsRun = cleanStringList([
    ...(importValue.testsRun ?? []),
    ...(importValue.verificationCommands ?? [])
  ]);
  if (testsRun.length === 0 && options.fallbackVerificationCommands?.length) {
    testsRun = cleanStringList(options.fallbackVerificationCommands);
  }

  let changedFiles = cleanStringList(importValue.changedFiles?.map(normalizePathish));
  if (changedFiles.length === 0 && options.fallbackChangedFiles?.length) {
    changedFiles = cleanStringList(options.fallbackChangedFiles.map(normalizePathish));
  }

  if (testsRun.length === 0) {
    warnings.push(WORKER_OUTPUT_NO_TESTS_WARNING);
  }

  return {
    source: importValue.source ?? options.source ?? "manual",
    rawOutput: importValue.rawOutput?.trim() || rawOutput.trim(),
    summary: importValue.summary,
    changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
    testsRun: testsRun.length > 0 ? testsRun : undefined,
    testOutput: importValue.testOutput,
    verificationCommands: importValue.verificationCommands,
    warnings: warnings.length > 0 ? warnings : undefined,
    knownLimitations: importValue.knownLimitations,
    risks: importValue.risks,
    diffStat: importValue.diffStat,
    withinScope: importValue.withinScope,
    scopeNotes: importValue.scopeNotes,
    capturedAt
  };
}

export function parseFeatureSprintWorkerOutputEvidence(
  rawOutput: string,
  options: ParseFeatureSprintWorkerOutputOptions = {}
): HarnessFeatureSprintWorkerOutputEvidence {
  const trimmed = rawOutput.trim();
  const capturedAt = resolveNow(options.now);
  const warnings: string[] = [];

  const fenceAttempted = hasWorkerOutputFenceAttempt(trimmed);
  const fenceImport = fenceAttempted ? parseFeatureWorkerOutputBlock(trimmed) : null;

  if (fenceImport) {
    return mapImportToEvidence(trimmed, fenceImport, options);
  }

  if (fenceAttempted) {
    warnings.push(WORKER_OUTPUT_MALFORMED_FENCE_WARNING);
  }

  const freeText = parseWorkerOutputFreeTextSections(trimmed);

  let changedFiles = freeText.changedFiles;
  if (changedFiles.length === 0 && options.fallbackChangedFiles?.length) {
    changedFiles = cleanStringList(options.fallbackChangedFiles.map(normalizePathish));
  }

  let testsRun = cleanStringList([...freeText.testsRun, ...freeText.verificationCommands]);
  if (testsRun.length === 0 && options.fallbackVerificationCommands?.length) {
    testsRun = cleanStringList(options.fallbackVerificationCommands);
  }

  warnings.push(...freeText.warnings);
  if (testsRun.length === 0 && trimmed.length > 0) {
    warnings.push(WORKER_OUTPUT_NO_TESTS_WARNING);
  }

  return {
    source: options.source ?? "manual",
    rawOutput: trimmed,
    summary: freeText.summary,
    changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
    testsRun: testsRun.length > 0 ? testsRun : undefined,
    testOutput: freeText.testOutput,
    verificationCommands:
      freeText.verificationCommands.length > 0 ? freeText.verificationCommands : undefined,
    warnings: warnings.length > 0 ? cleanStringList(warnings) : undefined,
    knownLimitations:
      freeText.knownLimitations.length > 0 ? freeText.knownLimitations : undefined,
    risks: freeText.risks.length > 0 ? freeText.risks : undefined,
    diffStat: freeText.diffStat,
    withinScope: freeText.withinScope,
    scopeNotes: freeText.scopeNotes.length > 0 ? freeText.scopeNotes : undefined,
    capturedAt
  };
}

export function normalizeWorkerOutputEvidenceRecord(
  evidence: HarnessFeatureSprintWorkerOutputEvidence | undefined
): HarnessFeatureSprintWorkerOutputEvidence | undefined {
  if (!evidence?.rawOutput?.trim()) {
    return undefined;
  }

  return {
    ...evidence,
    rawOutput: evidence.rawOutput.trim(),
    summary: evidence.summary?.trim() || undefined,
    changedFiles: cleanStringList(evidence.changedFiles?.map(normalizePathish)).slice(
      0,
      FEATURE_SPRINT_REVIEW_PACKET_MAX_FILES
    ),
    testsRun: cleanStringList(evidence.testsRun).slice(0, FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS),
    testOutput: evidence.testOutput?.trim() || undefined,
    verificationCommands: cleanStringList(evidence.verificationCommands).slice(
      0,
      FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS
    ),
    warnings: cleanStringList(evidence.warnings).slice(0, FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS),
    knownLimitations: cleanStringList(evidence.knownLimitations).slice(
      0,
      FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS
    ),
    risks: cleanStringList(evidence.risks).slice(0, FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS),
    diffStat: evidence.diffStat?.trim() || undefined,
    scopeNotes: cleanStringList(evidence.scopeNotes).slice(
      0,
      FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS
    )
  };
}

export function redactWorkerOutputForReviewPacket(text: string): {
  text: string;
  redacted: boolean;
} {
  let redacted = false;
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(result)) {
      redacted = true;
      result = result.replace(pattern, "[REDACTED]");
    }
  }
  return { text: result, redacted };
}

function formatBulletSection(title: string, items: string[]): string[] {
  if (items.length === 0) {
    return [title, "- (not provided)", ""];
  }
  return [title, ...items.map((item) => `- ${item}`), ""];
}

export function formatWorkerOutputEvidencePacketSections(
  evidence: HarnessFeatureSprintWorkerOutputEvidence | undefined
): string[] {
  if (!evidence) {
    return ["## Structured worker output evidence", "- (not provided)", ""];
  }

  const lines: string[] = ["## Structured worker output evidence", `- Source: ${evidence.source}`, ""];
  let packetRedacted = false;

  const summaryResult = evidence.summary
    ? redactWorkerOutputForReviewPacket(evidence.summary)
    : undefined;
  if (summaryResult?.redacted) {
    packetRedacted = true;
  }
  lines.push(
    "### Worker summary",
    summaryResult?.text?.trim() || "(not provided)",
    ""
  );

  const files = capStringListForReviewPacket(
    (evidence.changedFiles ?? []).map((file) => redactWorkerOutputForReviewPacket(file).text),
    FEATURE_SPRINT_REVIEW_PACKET_MAX_FILES
  );
  if ((evidence.changedFiles ?? []).some((file) => redactWorkerOutputForReviewPacket(file).redacted)) {
    packetRedacted = true;
  }
  lines.push(...formatBulletSection("### Changed files", files.lines));

  const tests = capStringListForReviewPacket(
    evidence.testsRun ?? [],
    FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS
  );
  lines.push(...formatBulletSection("### Tests run (worker-reported)", tests.lines));

  const verification = capStringListForReviewPacket(
    evidence.verificationCommands ?? [],
    FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS
  );
  lines.push(...formatBulletSection("### Verification commands (worker-reported)", verification.lines));

  const testOutputRaw = evidence.testOutput
    ? capText(evidence.testOutput, FEATURE_SPRINT_WORKER_OUTPUT_TEST_OUTPUT_MAX)
    : undefined;
  const testOutputResult = testOutputRaw
    ? redactWorkerOutputForReviewPacket(testOutputRaw)
    : undefined;
  if (testOutputResult?.redacted) {
    packetRedacted = true;
  }
  lines.push(
    "### Test output (excerpt)",
    testOutputResult?.text?.trim() || "(not provided)",
    ""
  );

  const warnings = capStringListForReviewPacket(
    (evidence.warnings ?? []).map((w) => redactWorkerOutputForReviewPacket(w).text),
    FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS
  );
  lines.push(...formatBulletSection("### Warnings", warnings.lines));

  const limitations = capStringListForReviewPacket(
    evidence.knownLimitations ?? [],
    FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS
  );
  lines.push(...formatBulletSection("### Known limitations", limitations.lines));

  const risks = capStringListForReviewPacket(
    evidence.risks ?? [],
    FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS
  );
  lines.push(...formatBulletSection("### Risks (worker-reported)", risks.lines));

  const scopeNotes = capStringListForReviewPacket(
    evidence.scopeNotes ?? [],
    FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS
  );
  lines.push(
    `### Scope: ${evidence.withinScope === false ? "possible drift / incomplete" : evidence.withinScope === true ? "within scope" : "unknown"}`,
    ...formatBulletSection("### Scope notes", scopeNotes.lines)
  );

  if (evidence.diffStat?.trim()) {
    const diffResult = redactWorkerOutputForReviewPacket(
      capText(evidence.diffStat, FEATURE_SPRINT_WORKER_OUTPUT_TEST_OUTPUT_MAX) ?? ""
    );
    if (diffResult.redacted) {
      packetRedacted = true;
    }
    lines.push("### Diff stat (worker-reported)", diffResult.text, "");
  } else {
    lines.push("### Diff stat (worker-reported)", "(not provided)", "");
  }

  const rawExcerpt = redactWorkerOutputForReviewPacket(
    capRawOutputExcerptForReviewPacket(evidence.rawOutput)
  );
  if (rawExcerpt.redacted) {
    packetRedacted = true;
  }
  lines.push("### Worker raw message (excerpt)", rawExcerpt.text, "");

  if (packetRedacted) {
    lines.push(`- ${WORKER_OUTPUT_SECRET_REDACTION_WARNING}`, "");
  }

  return lines;
}

export function resolveWorkerEvidenceForStep(step: {
  implementationProof?: { workerOutputEvidence?: HarnessFeatureSprintWorkerOutputEvidence };
  workerOutputEvidence?: HarnessFeatureSprintWorkerOutputEvidence;
}): HarnessFeatureSprintWorkerOutputEvidence | undefined {
  return (
    step.implementationProof?.workerOutputEvidence ?? step.workerOutputEvidence ?? undefined
  );
}

export function buildWorkerEvidenceScanText(
  evidence: HarnessFeatureSprintWorkerOutputEvidence | undefined
): string {
  if (!evidence) {
    return "";
  }
  const parts = [
    ...(evidence.warnings ?? []),
    ...(evidence.scopeNotes ?? []),
    evidence.testOutput ? capText(evidence.testOutput, FEATURE_SPRINT_WORKER_OUTPUT_TEST_OUTPUT_MAX) : undefined,
    evidence.summary
  ].filter(Boolean) as string[];
  return parts.map((part) => redactWorkerOutputForReviewPacket(part).text).join("\n");
}
