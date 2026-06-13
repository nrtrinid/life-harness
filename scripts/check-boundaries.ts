import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  absolute,
  changedFilePaths,
  isIgnored,
  readAgentIgnore,
  repoPath,
  truncateList,
  walkTextFiles
} from "./agent-utils";

type RuleId =
  | "app-source-no-services"
  | "core-ui-independent"
  | "raw-lab-contained"
  | "ask-harness-contained";

type Violation = {
  rule: RuleId;
  file: string;
  line: number;
  specifier: string;
  message: string;
};

const MAX_PER_RULE = 12;
const SOURCE_ROOTS = ["app", "src"];
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx)$/;

function importSpecifiers(text: string): { specifier: string; line: number }[] {
  const results: { specifier: string; line: number }[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^'"]+\s+from\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const before = text.slice(0, match.index ?? 0);
      results.push({
        specifier: match[1],
        line: before.split(/\r\n|\n|\r/).length
      });
    }
  }
  return results;
}

function normalizeImportTarget(file: string, specifier: string): string {
  if (!specifier.startsWith(".")) {
    return specifier;
  }
  const sourceDir = dirname(absolute(file));
  const resolved = resolve(sourceDir, specifier);
  return repoPath(relative(process.cwd(), resolved));
}

function isRuntimeSource(file: string): boolean {
  if (!SOURCE_EXTENSIONS.test(file)) return false;
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) return false;
  if (file.includes("/__tests__/")) return false;
  return true;
}

function isAppOrSrc(file: string): boolean {
  return file.startsWith("app/") || file.startsWith("src/");
}

function isCore(file: string): boolean {
  return file.startsWith("src/core/");
}

function isRawLabRuntime(file: string): boolean {
  if (!isRuntimeSource(file)) return false;
  if (file.startsWith("app/")) return false;
  if (file.startsWith("src/core/")) return /raw[-_]?lab|rawLab|RawLab/.test(file);
  if (file.startsWith("src/")) return /(^|\/)(raw[-_]?lab|rawLab|RawLab)[^/]*\.(ts|js)$/.test(file);
  return false;
}

function isAskHarnessRuntime(file: string): boolean {
  if (!isRuntimeSource(file)) return false;
  return /ask[-_]?harness|askHarness|AskHarness|chatHarness|ChatHarness|harnessContext/.test(file);
}

function servicesImport(specifier: string, target: string): boolean {
  return specifier.startsWith("services/") || specifier.startsWith("@/services/") || target.startsWith("services/");
}

function coreUiImport(specifier: string, target: string): boolean {
  if (specifier === "react" || specifier.startsWith("react/")) return true;
  if (specifier === "react-native" || specifier.startsWith("react-native")) return true;
  if (specifier === "expo" || specifier.startsWith("expo-")) return true;
  if (specifier.startsWith("app/") || target.startsWith("app/")) return true;
  if (specifier.startsWith("src/components/") || target.startsWith("src/components/")) return true;
  if (specifier.startsWith("src/state/") || target.startsWith("src/state/")) return true;
  if (/LifeHarnessProvider/.test(specifier) || /LifeHarnessProvider/.test(target)) return true;
  return false;
}

function rawLabBoardImport(specifier: string, target: string): boolean {
  const value = `${specifier} ${target}`;
  if (/LifeHarnessProvider|LifeHarnessState|persistence|storage/i.test(value)) return true;
  if (/src\/state|\/state\//.test(value)) return true;
  if (/src\/core\/actions$|src\/core\/actions\.|\/actions$/.test(target)) return true;
  if (/src\/core\/lifeHarnessData|src\/core\/types/.test(target)) return true;
  return false;
}

function askHarnessRawLabInternalImport(specifier: string, target: string): boolean {
  const value = `${specifier} ${target}`;
  if (!/raw[-_]?lab|rawLab|RawLab/.test(value)) return false;
  return /personality|thread|state|context|client|reflection/i.test(value);
}

function addViolation(
  violations: Violation[],
  rule: RuleId,
  file: string,
  line: number,
  specifier: string,
  message: string
): void {
  violations.push({ rule, file, line, specifier, message });
}

function scanFile(file: string): Violation[] {
  const text = readFileSync(absolute(file), "utf8");
  const violations: Violation[] = [];
  for (const item of importSpecifiers(text)) {
    const target = normalizeImportTarget(file, item.specifier);
    if (isAppOrSrc(file) && servicesImport(item.specifier, target)) {
      addViolation(
        violations,
        "app-source-no-services",
        file,
        item.line,
        item.specifier,
        "app/src code must not import services/"
      );
    }
    if (isCore(file) && coreUiImport(item.specifier, target)) {
      addViolation(
        violations,
        "core-ui-independent",
        file,
        item.line,
        item.specifier,
        "src/core must stay UI-independent"
      );
    }
    if (isRawLabRuntime(file) && rawLabBoardImport(item.specifier, target)) {
      addViolation(
        violations,
        "raw-lab-contained",
        file,
        item.line,
        item.specifier,
        "Raw Lab runtime must not import board state/actions/provider/persistence"
      );
    }
    if (isAskHarnessRuntime(file) && askHarnessRawLabInternalImport(item.specifier, target)) {
      addViolation(
        violations,
        "ask-harness-contained",
        file,
        item.line,
        item.specifier,
        "Ask Harness runtime must not import Raw Lab personality/thread internals"
      );
    }
  }
  return violations;
}

function warningLines(): string[] {
  const changed = changedFilePaths();
  const warnings: string[] = [];
  if (changed.some((file) => file === "package.json" || /(^|\/)(package-lock|pnpm-lock|yarn\.lock)/.test(file))) {
    warnings.push("Dependency/package files changed; dependency work must be explicitly scoped.");
  }
  if (changed.some((file) => /schema|migration|persistence|storage/i.test(file))) {
    warnings.push("Persistence/schema-adjacent files changed; call this out in the final response.");
  }
  return warnings;
}

const ignoreEntries = readAgentIgnore();
const files = SOURCE_ROOTS.flatMap((root) => walkTextFiles(root, { maxBytes: 250_000 }))
  .filter((file) => SOURCE_EXTENSIONS.test(file))
  .filter((file) => !isIgnored(file, ignoreEntries))
  .filter((file) => {
    const abs = absolute(file);
    return existsSync(abs) && statSync(abs).size <= 250_000;
  });

const violations = files.flatMap(scanFile);
const grouped = new Map<RuleId, Violation[]>();
for (const violation of violations) {
  grouped.set(violation.rule, [...(grouped.get(violation.rule) ?? []), violation]);
}

const warnings = warningLines();

console.log("# Boundary Check");
console.log(`Result: ${violations.length === 0 ? "PASS" : "FAIL"}`);
console.log(`Files scanned: ${files.length}`);
console.log(`Violations: ${violations.length}`);
console.log(`Warnings: ${warnings.length}`);

if (violations.length > 0) {
  console.log("");
  console.log("## Violations");
  for (const [rule, items] of Array.from(grouped.entries()).sort()) {
    const { shown, omitted } = truncateList(items, MAX_PER_RULE);
    console.log(`### ${rule} (${items.length})`);
    for (const item of shown) {
      console.log(`- ${item.file}:${item.line} imports "${item.specifier}" - ${item.message}`);
    }
    if (omitted > 0) {
      console.log(`- ... ${omitted} more`);
    }
  }
}

if (warnings.length > 0) {
  console.log("");
  console.log("## Warnings");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

process.exit(violations.length > 0 ? 1 : 0);
