import { describe, expect, it } from "vitest";

import { parseCareerSourcePackJson } from "./careerSourcePack";
import { buildCareerSourcePackFromMarkdown, type CareerSourceMarkdownFile } from "./careerSourcePackBuilder";

function fixtureFiles(extra: CareerSourceMarkdownFile[] = []): CareerSourceMarkdownFile[] {
  return [
    {
      path: "README.md",
      content: `# Career Source

## Current positioning

1. **EV Tracker** - full-stack analytics.
2. **The Charter** - simulation diagnostics.`
    },
    {
      path: "source_inventory.md",
      content: `# Source Inventory

## Important inconsistencies to verify

- GPA: older files use 3.31; latest current draft uses 3.32.`
    },
    {
      path: "projects/ev_tracker.md",
      content: `# EV Tracker - Live-Market Analytics & Risk Platform

## Best 3-bullet resume version

- Built a full-stack analytics platform using Next.js, FastAPI, Supabase, PostgreSQL, and Docker.
- Engineered an odds pipeline integrating external APIs and scheduled board publishing.

## Claims to avoid

- Do not claim exact users without verified metrics.

## Metrics to gather

- Beta testers invited.
- Scheduler job success rate.

## Evidence source

- README.md
- backend/main.py`
    },
    {
      path: "projects/the_charter_ai_lab.md",
      content: `# The Charter - AI Simulation & Diagnostics Lab

## Best 3-bullet resume version

- Built Python simulations with Pytest, YAML content, and diagnostics.

## Claims to avoid

- Do not claim production ML.`
    },
    {
      path: "projects/network_security_lab.md",
      content: `# Network Security & Offensive Operations Laboratory

## Best default bullets

- Completed controlled CTF challenges across web, network, and binary exploitation.

## Claims to avoid

- Do not imply professional red-team experience.`
    },
    {
      path: "projects/auditwiseai.md",
      content: `# AuditWiseAI

## Best default bullets

- Built audit-risk triage workflows with RBAC and structured logs.`
    },
    {
      path: "roles/general_swe.md",
      content: `# General SWE / New Grad Resume Recipe

## Target story

Builder who can ship and test software.

## Project order

1. EV Tracker
2. The Charter / AI Simulation & Diagnostics Lab
3. Network Security Lab

## Summary

\`\`\`text
Recent CS graduate with software project experience.
\`\`\`

## Skills

\`\`\`text
Languages: Python, TypeScript, SQL
Backend & Data: FastAPI, PostgreSQL, Docker
\`\`\`

## Recommended bullets

- Built software with tests.`
    },
    {
      path: "roles/cyber_defense.md",
      content: `# Cybersecurity / Defense Resume Recipe

## Project order

1. Network Security Lab
2. EV Tracker

## Summary

\`\`\`text
Clearance-eligible CS graduate with secure software experience.
\`\`\`

## Skills

\`\`\`text
Security: Wireshark, Ghidra, GDB
\`\`\``
    },
    {
      path: "bullet_banks/summaries_and_skills.md",
      content: `# Summary And Skills Bank

## Summary options

\`\`\`text
Recent CS graduate with full-stack and security-aware software experience.
\`\`\`

## Skills blocks

\`\`\`text
Languages: Python, TypeScript, Java
Backend & Data: FastAPI, PostgreSQL, Docker
\`\`\``
    },
    {
      path: "notes/claims_to_avoid.md",
      content: `# Claims To Avoid

- Do not add exact users without verified metrics.
- Do not imply professional red-team work.`
    },
    {
      path: "notes/metrics_to_gather.md",
      content: `# Metrics To Gather

## EV Tracker

- Number of beta testers invited.

## The Charter

- Full Pytest result with long timeout.`
    },
    {
      path: "notes/interview_story_bank.md",
      content: `# Interview Story Bank

## EV Tracker - Multi-tenant auth

- Situation: The app stores user-owned analytics data.
- Action: Added auth and user scoping.
- Result: Authenticated workflows are user-scoped.`
    },
    ...extra
  ];
}

describe("buildCareerSourcePackFromMarkdown", () => {
  it("extracts modules, roles, claims, metrics, and stories from markdown", () => {
    const result = buildCareerSourcePackFromMarkdown({
      files: fixtureFiles(),
      generatedAt: "2026-06-11T00:00:00.000Z",
      sourceRepo: "fixture-career-source"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const moduleIds = result.pack.resumeModules.map((module) => module.id);
    expect(moduleIds).toEqual(
      expect.arrayContaining([
        "asu_computer_science",
        "technical_skills_general",
        "ev_tracker",
        "the_charter_ai_lab",
        "network_security_lab",
        "auditwiseai",
        "legoland_robotics",
        "soda_student_org"
      ])
    );
    expect(result.pack.roleRecipes.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["general_swe", "cyber_defense"])
    );
    expect(result.pack.roleRecipes.find((recipe) => recipe.id === "general_swe")?.preferredModuleIds).toEqual([
      "ev_tracker",
      "the_charter_ai_lab",
      "network_security_lab"
    ]);
    expect(result.pack.claimsSafety.globalClaimsToAvoid.length).toBeGreaterThan(0);
    expect(result.pack.metricsToGather.some((metric) => metric.moduleId === "ev_tracker")).toBe(true);
    expect(result.pack.interviewStories[0]).toMatchObject({
      id: "ev_tracker_multi_tenant_auth",
      title: "EV Tracker - Multi-tenant auth"
    });
  });

  it("emits a valid Career Source Pack v1 with resume placement metadata", () => {
    const result = buildCareerSourcePackFromMarkdown({
      files: fixtureFiles(),
      generatedAt: "2026-06-11T00:00:00.000Z"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const parsed = parseCareerSourcePackJson(JSON.stringify(result.pack));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const evTracker = parsed.pack.resumeModules.find((module) => module.id === "ev_tracker");
    expect(evTracker?.resumePlacement).toMatchObject({
      section: "projects",
      heading: "EV Tracker - Live-Market Analytics & Risk Platform",
      order: 10
    });
  });

  it("omits secret-like source lines and keeps the generated pack importable", () => {
    const result = buildCareerSourcePackFromMarkdown({
      files: fixtureFiles([
        {
          path: "projects/secret_line.md",
          content: `# Secret Line

## Best default bullets

- Built a thing with SUPABASE_SERVICE_ROLE copied into notes.
- Built a safe thing.`
        }
      ]),
      generatedAt: "2026-06-11T00:00:00.000Z"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.warnings.some((warning) => warning.includes("Omitted secret-like content"))).toBe(true);
    expect(JSON.stringify(result.pack)).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(parseCareerSourcePackJson(JSON.stringify(result.pack)).ok).toBe(true);
  });

  it("warns on PII-like source text without failing generation", () => {
    const result = buildCareerSourcePackFromMarkdown({
      files: fixtureFiles([
        {
          path: "notes/pii.md",
          content: "Reach me at test@example.com."
        }
      ]),
      generatedAt: "2026-06-11T00:00:00.000Z"
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((warning) => warning.toLowerCase().includes("email"))).toBe(true);
  });
});
