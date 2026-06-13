import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  LevelFormat,
  Packer,
  PageOrientation,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
  type ISectionOptions
} from "docx";

import { normalizeResumeDate } from "./resumeDateFormat";

export interface ResumeProfile {
  name: string;
  contactItems: string[];
}

export interface ResumeEducationEntry {
  degree: string;
  date: string;
  school: string;
  detailRight?: string;
  details?: string[];
}

export interface ResumeSkillGroup {
  label: string;
  skills: string;
}

export interface ResumeEntry {
  title: string;
  meta?: string;
  date: string;
  bullets: string[];
}

export interface ResumeDocxDraft {
  profile: ResumeProfile;
  summary: string;
  education: ResumeEducationEntry[];
  skills: ResumeSkillGroup[];
  projects: ResumeEntry[];
  additionalExperience: ResumeEntry[];
}

export interface ResumeDocxBuildResult {
  document: Document;
  sectionOrder: string[];
}

const FONT_FACE = "Calibri";
const BODY_SIZE = 21;
const NAME_SIZE = 44;
const RIGHT_TAB = convertInchesToTwip(7.5);
const PAGE_WIDTH = convertInchesToTwip(8.5);
const PAGE_HEIGHT = convertInchesToTwip(11);
const HALF_INCH = convertInchesToTwip(0.5);
const BULLET_INDENT_LEFT = convertInchesToTwip(0.5);
const BULLET_INDENT_HANGING = convertInchesToTwip(0.25);
const BULLET_NUMBERING_REF = "resume-bullets";

const SECTION_HEADING_SPACING = { before: 120, after: 60, line: 240 };
const TITLE_ROW_SPACING = { before: 40, after: 0, line: 240 };
const BODY_SPACING = { before: 0, after: 0, line: 240 };

const DUPLICATE_SKILL_LABELS = [/^technical\s+skills:?$/i, /^skills:?$/i];

function clean(value: string): string {
  return value.trim();
}

function isBlank(value: string | undefined): boolean {
  return !value || clean(value).length === 0;
}

function assertNonEmptyArray<T>(items: T[], label: string): void {
  if (items.length === 0) {
    throw new Error(`${label} must include at least one item.`);
  }
}

export function formatSkillGroupLabel(label: string): string {
  const trimmed = clean(label);
  if (!trimmed) {
    return "";
  }
  for (const pattern of DUPLICATE_SKILL_LABELS) {
    if (pattern.test(trimmed)) {
      return "";
    }
  }
  return trimmed.replace(/:$/, "");
}

export function validateResumeDocxDraft(draft: ResumeDocxDraft): void {
  if (isBlank(draft.profile?.name)) {
    throw new Error("Profile name is required.");
  }
  assertNonEmptyArray(draft.profile.contactItems.filter((item) => !isBlank(item)), "Profile contact items");
  if (isBlank(draft.summary)) {
    throw new Error("Summary is required.");
  }
  assertNonEmptyArray(draft.education, "Education");
  assertNonEmptyArray(draft.skills, "Skills");
  assertNonEmptyArray(draft.projects, "Projects");

  for (const entry of [...draft.projects, ...draft.additionalExperience]) {
    if (isBlank(entry.title) || isBlank(entry.date)) {
      throw new Error("Resume entries require title and date.");
    }
    assertNonEmptyArray(entry.bullets.filter((bullet) => !isBlank(bullet)), entry.title);
  }
}

function bodyRun(text: string, options?: { bold?: boolean }): TextRun {
  return new TextRun({
    text,
    bold: options?.bold,
    font: FONT_FACE,
    size: BODY_SIZE
  });
}

function paragraph(
  children: TextRun[],
  options?: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    tabbed?: boolean;
    spacing?: { before?: number; after?: number; line?: number };
    border?: {
      bottom?: { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size?: number; space?: number; color?: string };
    };
  }
): Paragraph {
  return new Paragraph({
    children,
    alignment: options?.alignment,
    spacing: options?.spacing ?? BODY_SPACING,
    border: options?.border,
    tabStops: options?.tabbed ? [{ type: TabStopType.RIGHT, position: RIGHT_TAB }] : undefined
  });
}

function sectionHeading(label: string): Paragraph {
  return paragraph([bodyRun(label.toUpperCase(), { bold: true })], {
    spacing: SECTION_HEADING_SPACING,
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: "000000" }
    }
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: BULLET_NUMBERING_REF, level: 0 },
    spacing: BODY_SPACING,
    children: [bodyRun(text)]
  });
}

function entryHeading(entry: ResumeEntry): Paragraph {
  const left = entry.meta ? `${entry.title} | ${entry.meta}` : entry.title;
  return paragraph(
    [bodyRun(left, { bold: true }), new TextRun({ children: [new Tab()] }), bodyRun(normalizeResumeDate(entry.date))],
    { tabbed: true, spacing: TITLE_ROW_SPACING }
  );
}

function educationHeading(entry: ResumeEducationEntry): Paragraph {
  return paragraph(
    [
      bodyRun(entry.degree, { bold: true }),
      new TextRun({ children: [new Tab()] }),
      bodyRun(normalizeResumeDate(entry.date))
    ],
    { tabbed: true, spacing: TITLE_ROW_SPACING }
  );
}

function educationSchool(entry: ResumeEducationEntry): Paragraph {
  const children = [bodyRun(entry.school)];
  if (entry.detailRight) {
    children.push(new TextRun({ children: [new Tab()] }), bodyRun(entry.detailRight));
  }
  return paragraph(children, { tabbed: Boolean(entry.detailRight) });
}

function skillLine(group: ResumeSkillGroup): Paragraph {
  const label = formatSkillGroupLabel(group.label);
  if (!label) {
    return paragraph([bodyRun(clean(group.skills))]);
  }
  return paragraph([bodyRun(`${label}: `, { bold: true }), bodyRun(clean(group.skills))]);
}

function entryParagraphs(entry: ResumeEntry): Paragraph[] {
  return [
    entryHeading(entry),
    ...entry.bullets.filter((bullet) => !isBlank(bullet)).map((bullet) => bulletParagraph(clean(bullet)))
  ];
}

function buildChildren(draft: ResumeDocxDraft): { children: Paragraph[]; sectionOrder: string[] } {
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: clean(draft.profile.name), bold: true, font: FONT_FACE, size: NAME_SIZE })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40, line: 240 }
    }),
    paragraph([bodyRun(draft.profile.contactItems.map(clean).join(" • "))], {
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80, line: 240 }
    }),
    sectionHeading("Summary"),
    paragraph([bodyRun(clean(draft.summary))]),
    sectionHeading("Education")
  ];

  for (const item of draft.education) {
    children.push(educationHeading(item), educationSchool(item));
    for (const detail of item.details ?? []) {
      children.push(paragraph([bodyRun(clean(detail))]));
    }
  }

  children.push(sectionHeading("Technical Skills"));
  for (const group of draft.skills) {
    children.push(skillLine(group));
  }

  children.push(sectionHeading("Projects"));
  for (const project of draft.projects) {
    children.push(...entryParagraphs(project));
  }

  if (draft.additionalExperience.length > 0) {
    children.push(sectionHeading("Additional Experience & Activities"));
    for (const entry of draft.additionalExperience) {
      children.push(...entryParagraphs(entry));
    }
  }

  return {
    children,
    sectionOrder: ["header", "summary", "education", "skills", "projects", "additionalExperience"]
  };
}

export function buildResumeDocx(draft: ResumeDocxDraft): ResumeDocxBuildResult {
  validateResumeDocxDraft(draft);
  const { children, sectionOrder } = buildChildren(draft);
  const section: ISectionOptions = {
    properties: {
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT, orientation: PageOrientation.PORTRAIT },
        margin: {
          top: HALF_INCH,
          right: HALF_INCH,
          bottom: HALF_INCH,
          left: HALF_INCH
        }
      }
    },
    children
  };

  return {
    document: new Document({
      styles: {
        default: {
          document: {
            run: { font: FONT_FACE, size: BODY_SIZE },
            paragraph: { spacing: BODY_SPACING }
          }
        }
      },
      numbering: {
        config: [
          {
            reference: BULLET_NUMBERING_REF,
            levels: [
              {
                level: 0,
                format: LevelFormat.BULLET,
                text: "\u2022",
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: {
                    indent: { left: BULLET_INDENT_LEFT, hanging: BULLET_INDENT_HANGING }
                  }
                }
              }
            ]
          }
        ]
      },
      sections: [section]
    }),
    sectionOrder
  };
}

export async function packResumeDocx(draft: ResumeDocxDraft): Promise<Buffer> {
  return Packer.toBuffer(buildResumeDocx(draft).document);
}

export async function packResumeDocxBlob(draft: ResumeDocxDraft): Promise<Blob> {
  return Packer.toBlob(buildResumeDocx(draft).document);
}
