import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildApplicationResumeDocxDraft,
  buildApplicationResumeDocxDraftFromState
} from "./applicationResumeExport";
import type { ResumeProfile } from "./resumeDocx";
import { parseImportJson } from "../storage/persistence";

const snapshotPath = join(process.cwd(), "fixtures/resume/application.snapshot.sample.json");
const profilePath = join(process.cwd(), "fixtures/resume/profile.sample.json");

function loadFixtureState() {
  const parsed = parseImportJson(readFileSync(snapshotPath, "utf8"), new Date("2026-06-10T12:00:00.000Z"));
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? "Failed to parse fixture snapshot.");
  }
  return parsed.data;
}

function loadProfile(): ResumeProfile {
  return JSON.parse(readFileSync(profilePath, "utf8")) as ResumeProfile;
}

describe("application resume export", () => {
  it("maps packet modules into the canonical DOCX section order", () => {
    const state = loadFixtureState();
    const result = buildApplicationResumeDocxDraftFromState(
      state,
      "card_sample_application",
      loadProfile()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.draft.profile.name).toBe("Sample Candidate");
    expect(result.draft.summary).toContain("Software engineer");
    expect(result.draft.education.map((entry) => entry.school)).toEqual([
      "Example State University"
    ]);
    expect(result.draft.skills.map((group) => group.label)).toEqual(["Technical"]);
    expect(result.draft.projects.map((entry) => entry.title)).toEqual([
      "Life Harness / Local Scout",
      "EV Tracker / Kalshi Market Tooling"
    ]);
    expect(result.draft.additionalExperience.map((entry) => entry.title)).toEqual([
      "Legoland Robotics / Customer-Facing Operations"
    ]);
  });

  it("fails clearly for missing profile fields", () => {
    const state = loadFixtureState();
    const result = buildApplicationResumeDocxDraftFromState(
      state,
      "card_sample_application",
      { name: "", contactItems: [] }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Profile name is required.");
      expect(result.errors).toContain("Profile contact items are required.");
    }
  });

  it("fails clearly for missing card, missing packet, and deleted module ids", () => {
    const state = loadFixtureState();
    const profile = loadProfile();

    const missingCard = buildApplicationResumeDocxDraftFromState(state, "missing-card", profile);
    expect(missingCard.ok).toBe(false);
    if (!missingCard.ok) {
      expect(missingCard.errors).toContain("Application card not found: missing-card.");
    }

    const cardWithoutPacket = {
      ...state.cards[0],
      careerApplication: state.cards[0].careerApplication
        ? { ...state.cards[0].careerApplication, resumeDraftPacket: undefined }
        : undefined
    };
    const noPacket = buildApplicationResumeDocxDraft(cardWithoutPacket, state.resumeModules, profile);
    expect(noPacket.ok).toBe(false);
    if (!noPacket.ok) {
      expect(noPacket.errors).toContain("Application card has no resume draft packet.");
    }

    const cardWithMissingModule = {
      ...state.cards[0],
      careerApplication: state.cards[0].careerApplication
        ? {
            ...state.cards[0].careerApplication,
            resumeDraftPacket: state.cards[0].careerApplication.resumeDraftPacket
              ? {
                  ...state.cards[0].careerApplication.resumeDraftPacket,
                  selectedModuleIds: ["missing-module"]
                }
              : undefined
          }
        : undefined
    };
    const missingModule = buildApplicationResumeDocxDraft(
      cardWithMissingModule,
      state.resumeModules,
      profile
    );
    expect(missingModule.ok).toBe(false);
    if (!missingModule.ok) {
      expect(missingModule.errors).toContain("Missing resume module: missing-module.");
    }
  });

  it("CLI writes a DOCX from the sanitized application snapshot fixture", () => {
    const outPath = join(process.cwd(), "tmp/test-application-resume.docx");
    rmSync(outPath, { force: true });

    const args = [
      "scripts/build-application-resume-docx.ts",
      "--snapshot",
      snapshotPath,
      "--cardId",
      "card_sample_application",
      "--profile",
      profilePath,
      "--out",
      outPath
    ];
    if (process.platform === "win32") {
      execFileSync("cmd.exe", ["/c", "node_modules\\.bin\\tsx.cmd", ...args]);
    } else {
      execFileSync("node_modules/.bin/tsx", args);
    }

    expect(existsSync(outPath)).toBe(true);
    expect(statSync(outPath).size).toBeGreaterThan(1000);
  }, 15000);
});
