import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import sampleDraft from "../../fixtures/resume/general.sample.json";
import {
  buildResumeDocx,
  formatSkillGroupLabel,
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

async function numberingXml(draft: ResumeDocxDraft): Promise<string> {
  const buffer = await packResumeDocx(draft);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/numbering.xml")?.async("string");
  if (!xml) {
    throw new Error("word/numbering.xml missing from generated DOCX.");
  }
  return xml;
}

function documentText(xml: string): string {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join("");
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

  it("adds bottom borders to section headings", async () => {
    const xml = await documentXml(sampleDraft as ResumeDocxDraft);

    expect(xml).toContain("<w:pBdr>");
    expect(xml).toContain("<w:bottom");
    expect(xml).toMatch(/<w:pBdr>[\s\S]*<w:t[^>]*>SUMMARY<\/w:t>/);
  });

  it("uses numbering for module bullet paragraphs", async () => {
    const draft = sampleDraft as ResumeDocxDraft;
    const xml = await documentXml(draft);
    const numbering = await numberingXml(draft);

    expect(xml).toContain("<w:numPr>");
    expect(numbering).toContain('w:left="720"');
    expect(numbering).toContain('w:hanging="360"');
  });

  it("normalizes lowercase date ranges in exported text", async () => {
    const xml = await documentXml(sampleDraft as ResumeDocxDraft);
    const text = documentText(xml);

    expect(text).toContain("April 2023 – July 2023");
    expect(text).toContain("August 2023 – May 2026");
    expect(text).not.toMatch(/\bapril\b/i);
    expect(text).not.toMatch(/\bseptember\b/i);
  });

  it("does not duplicate Technical Skills labels in skill lines", async () => {
    const draft: ResumeDocxDraft = {
      ...(sampleDraft as ResumeDocxDraft),
      skills: [
        { label: "Technical Skills", skills: "Python, TypeScript" },
        { label: "Languages", skills: "Python, C++" }
      ]
    };
    const xml = await documentXml(draft);
    const text = documentText(xml);

    expect(formatSkillGroupLabel("Technical Skills")).toBe("");
    expect(text).not.toContain("Technical Skills: Technical Skills");
    expect(text).toContain("Languages: Python, C++");
    expect(text).toContain("Python, TypeScript");
  });

  it("builds a sample export buffer", async () => {
    const buffer = await packResumeDocx(sampleDraft as ResumeDocxDraft);
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});
