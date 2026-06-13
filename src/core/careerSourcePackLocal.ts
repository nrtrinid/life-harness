import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import type { CareerSourceMarkdownFile } from "./careerSourcePackBuilder";
import { parseCareerSourcePackJson, type CareerSourcePackV1 } from "./careerSourcePack";

export const LOCAL_CAREER_SOURCE_DIR = "private/career-source";
export const LOCAL_CAREER_PACK_OUTPUT = "resume_pack/life_harness_career_pack.v1.json";

export interface CareerPackCounts {
  resumeModules: number;
  projectModules: number;
  roleRecipes: number;
  interviewStories: number;
  globalClaimsToAvoid: number;
  unsupportedClaims: number;
  metricsToGather: number;
}

export type CareerPackValidationResult =
  | {
      ok: true;
      pack: CareerSourcePackV1;
      warnings: string[];
      counts: CareerPackCounts;
    }
  | { ok: false; error: string; warnings: string[] };

export function collectCareerSourceMarkdownFiles(
  root: string,
  dir = root
): CareerSourceMarkdownFile[] {
  const files: CareerSourceMarkdownFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCareerSourceMarkdownFiles(root, fullPath));
      continue;
    }
    if (!entry.isFile() || !/\.(md|txt)$/i.test(entry.name)) {
      continue;
    }
    files.push({
      path: relative(root, fullPath).replace(/\\/g, "/"),
      content: readFileSync(fullPath, "utf8")
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function isPlaceholderCareerSource(files: CareerSourceMarkdownFile[]): boolean {
  if (files.length === 0) {
    return true;
  }
  return files.every((file) => {
    const name = file.path.split("/").pop()?.toLowerCase() ?? "";
    return name === "readme.md";
  });
}

export function countCareerPackSections(pack: CareerSourcePackV1): CareerPackCounts {
  return {
    resumeModules: pack.resumeModules.length,
    projectModules: pack.resumeModules.filter((module) => module.category === "project").length,
    roleRecipes: pack.roleRecipes.length,
    interviewStories: pack.interviewStories.length,
    globalClaimsToAvoid: pack.claimsSafety.globalClaimsToAvoid.length,
    unsupportedClaims: pack.claimsSafety.unsupportedClaims.length,
    metricsToGather: pack.metricsToGather.length
  };
}

export function validateCareerSourcePackJson(json: string): CareerPackValidationResult {
  const parsed = parseCareerSourcePackJson(json);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, warnings: [] };
  }

  return {
    ok: true,
    pack: parsed.pack,
    warnings: parsed.warnings,
    counts: countCareerPackSections(parsed.pack)
  };
}

export function formatCareerPackValidationLines(result: CareerPackValidationResult): string[] {
  if (!result.ok) {
    return [`Career Pack validation failed: ${result.error}`];
  }

  const lines = [
    `Career Pack validation passed.`,
    `Built: ${result.pack.extractionMetadata.generatedAt}`,
    `Resume modules: ${result.counts.resumeModules} (${result.counts.projectModules} projects)`,
    `Role recipes: ${result.counts.roleRecipes}`,
    `Interview stories: ${result.counts.interviewStories}`,
    `Claims guardrails: ${result.counts.globalClaimsToAvoid} global · ${result.counts.unsupportedClaims} unsupported`,
    `Metrics to gather: ${result.counts.metricsToGather}`
  ];

  const packWarnings = result.pack.extractionMetadata.warnings;
  if (packWarnings.length > 0) {
    lines.push(`Pack warnings: ${packWarnings.length}`);
    for (const warning of packWarnings.slice(0, 5)) {
      lines.push(`  △ ${warning}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push(`Import warnings: ${result.warnings.length}`);
    for (const warning of result.warnings.slice(0, 5)) {
      lines.push(`  △ ${warning}`);
    }
  }

  return lines;
}

export const PLACEHOLDER_CAREER_SOURCE_MESSAGE =
  "private/career-source only contains README placeholders. Copy real career-source markdown into private/career-source/ (see private/career-source/README.md), or build from ../career-source with npm run career:pack:build.";
