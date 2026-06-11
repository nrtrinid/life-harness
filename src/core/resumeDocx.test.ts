import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import sampleDraft from "../../fixtures/resume/general.sample.json";
import {
  buildResumeDocx,
  packResumeDocx,
  validateResumeDocxDraft,
  type ResumeDocxDraft
} from "./resumeDocx";

async function documentXml(draft: ResumeDocxDraft): Promise<string> {
  const buffer = await packResumeDocx(draft);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) {
    throw new Error("word/document.xml missing from generated DOCX.");
  }
  return xml;
}

describe("resumeDocx", () => {
  it("validates required profile, summary, and sections", () => {
    expect(() =>
      validateResumeDocxDraft({ ...(sampleDraft as ResumeDocxDraft), profile: { name: "", contactItems: [] } })
    ).toThrow(/Profile name/);
    expect(() => validateResumeDocxDraft({ ...(sampleDraft as ResumeDocxDraft), summary: "" })).toThrow(
      /Summary/
    );
    expect(() => validateResumeDocxDraft({ ...(sampleDraft as ResumeDocxDraft), projects: [] })).toThrow(
      /Projects/
    );
  });

  it("maps section order exactly", () => {
    const result = buildResumeDocx(sampleDraft as ResumeDocxDraft);

    expect(result.sectionOrder).toEqual([
      "header",
      "summary",
      "education",
      "skills",
      "projects",
      "additionalExperience"
    ]);
  });

  it("writes canonical page geometry and right-aligned tab stops", async () => {
    const xml = await documentXml(sampleDraft as ResumeDocxDraft);

    expect(xml).toContain('w:w="12240"');
    expect(xml).toContain('w:h="15840"');
    expect(xml).toContain('w:top="720"');
    expect(xml).toContain('w:right="720"');
    expect(xml).toContain('w:bottom="720"');
    expect(xml).toContain('w:left="720"');
    expect(xml).toContain('w:val="right"');
    expect(xml).toContain('w:pos="10800"');
  });

  it("uses bold run formatting for section headers, skill labels, and entry titles", async () => {
    const xml = await documentXml(sampleDraft as ResumeDocxDraft);

    expect(xml).toMatch(/<w:b\/>[\s\S]*<w:t[^>]*>SUMMARY<\/w:t>/);
    expect(xml).toMatch(/<w:b\/>[\s\S]*<w:t[^>]*>Languages: <\/w:t>/);
    expect(xml).toMatch(/<w:b\/>[\s\S]*<w:t[^>]*>Market Analytics &amp; Risk Platform/);
  });
});
