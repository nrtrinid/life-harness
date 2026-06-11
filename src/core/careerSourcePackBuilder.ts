import {
  parseCareerSourcePackJson,
  type CareerPackClaimsSafety,
  type CareerPackInterviewStory,
  type CareerPackMetricToGather,
  type CareerPackResumeModule,
  type CareerPackRoleRecipe,
  type CareerSourcePackV1
} from "./careerSourcePack";
import type { ResumeModulePlacement, ResumeModuleSection, RoleType } from "./types";

export interface CareerSourceMarkdownFile {
  path: string;
  content: string;
}

export interface BuildCareerSourcePackInput {
  files: CareerSourceMarkdownFile[];
  generatedAt?: string;
  sourceRepo?: string;
}

export type BuildCareerSourcePackResult =
  | { ok: true; pack: CareerSourcePackV1; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

const SECRET_PATTERNS: RegExp[] = [
  /SUPABASE_SERVICE_ROLE/i,
  /service_role/i,
  /\bapi_key\b/i,
  /DISCORD_WEBHOOK/i,
  /\.env\b/i,
  /\bsk-[a-zA-Z0-9]{10,}/,
  /\bghp_[a-zA-Z0-9]{20,}/,
  /\bAKIA[0-9A-Z]{16}/
];

const EMAIL_PATTERN = /@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/;

const ROLE_TYPE_BY_ROLE_ID: Record<string, RoleType[]> = {
  general_swe: ["software"],
  full_stack_backend: ["full_stack", "software"],
  cyber_defense: ["cybersecurity", "software"],
  ai_tooling_simulation: ["software", "full_stack"],
  finance_backend_data: ["data_finance", "software"],
  systems_low_level: ["software", "it"],
  public_sector_it: ["it", "cybersecurity"]
};

const ROLE_KEYWORDS: Record<string, string[]> = {
  general_swe: ["software engineer", "new grad", "junior", "entry-level", "python", "typescript"],
  full_stack_backend: ["backend", "full stack", "api", "fastapi", "postgresql", "docker"],
  cyber_defense: ["security", "cybersecurity", "linux", "clearance", "defense", "reverse engineering"],
  ai_tooling_simulation: ["simulation", "ai", "llm", "testing", "diagnostics", "pytest"],
  finance_backend_data: ["finance", "risk", "analytics", "data", "sql", "expected value"],
  systems_low_level: ["systems", "c++", "linux", "debugging", "network", "low-level"],
  public_sector_it: ["government", "public sector", "county", "it analyst", "documentation"]
};

const ROLE_NEGATIVE_KEYWORDS = ["senior", "staff", "principal", "10+ years", "active clearance required", "ts/sci required", "no new grads"];

const MODULE_ROLE_TAGS: Record<string, RoleType[]> = {
  ev_tracker: ["full_stack", "software", "data_finance", "cybersecurity"],
  the_charter_ai_lab: ["software", "full_stack"],
  network_security_lab: ["cybersecurity", "software", "it"],
  auditwiseai: ["software", "cybersecurity", "full_stack"],
  javafx_secure_user_management: ["software", "cybersecurity", "it"],
  c_phone_directory: ["software", "it"],
  cpp_modular_text_adventure: ["software"]
};

const MODULE_ORDER = [
  "ev_tracker",
  "the_charter_ai_lab",
  "network_security_lab",
  "auditwiseai",
  "javafx_secure_user_management",
  "c_phone_directory",
  "cpp_modular_text_adventure"
];

const MODULE_KEYWORDS: Record<string, string[]> = {
  ev_tracker: ["fastapi", "next.js", "postgresql", "supabase", "docker", "analytics", "auth"],
  the_charter_ai_lab: ["python", "pytest", "simulation", "diagnostics", "yaml", "textual"],
  network_security_lab: ["security", "wireshark", "ghidra", "gdb", "ctf", "linux"],
  auditwiseai: ["audit", "rbac", "risk", "openai", "triage"],
  javafx_secure_user_management: ["java", "javafx", "encryption", "rbac"],
  c_phone_directory: ["c", "data structures", "file i/o"],
  cpp_modular_text_adventure: ["c++", "oop", "game systems"]
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripMarkdown(value: string): string {
  return cleanLine(
    value
      .replace(/^#+\s*/, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\s+\|\s+.*$/, "")
  );
}

function containsSecretLike(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function safeText(value: string, warnings: string[], source: string): string | undefined {
  const cleaned = stripMarkdown(value);
  if (!cleaned) {
    return undefined;
  }
  if (containsSecretLike(cleaned)) {
    warnings.push(`Omitted secret-like content from ${source}.`);
    return undefined;
  }
  if (EMAIL_PATTERN.test(cleaned)) {
    warnings.push(`Possible email address detected in ${source}.`);
  }
  if (PHONE_PATTERN.test(cleaned)) {
    warnings.push(`Possible phone number detected in ${source}.`);
  }
  return cleaned;
}

function findFile(files: CareerSourceMarkdownFile[], path: string): CareerSourceMarkdownFile | undefined {
  const normalized = normalizePath(path);
  return files.find((file) => normalizePath(file.path) === normalized);
}

function filesIn(files: CareerSourceMarkdownFile[], prefix: string): CareerSourceMarkdownFile[] {
  const normalizedPrefix = normalizePath(prefix);
  return files
    .filter((file) => normalizePath(file.path).startsWith(normalizedPrefix))
    .sort((a, b) => normalizePath(a.path).localeCompare(normalizePath(b.path)));
}

function headingTitle(markdown: string, fallback: string): string {
  const firstHeading = markdown.split(/\r?\n/).find((line) => line.startsWith("# "));
  return firstHeading ? stripMarkdown(firstHeading) : fallback;
}

function section(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`);
  if (start < 0) {
    return "";
  }
  const collected: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^##\s+/.test(line)) {
      break;
    }
    collected.push(line);
  }
  return collected.join("\n");
}

function bulletLines(markdown: string, warnings: string[], source: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => safeText(line.slice(2), warnings, source))
    .filter((line): line is string => Boolean(line));
}

function fencedBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:text)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function firstSentence(markdown: string, warnings: string[], source: string): string | undefined {
  const line = markdown
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0 && !item.startsWith("#") && !item.startsWith("```") && !item.startsWith("- "));
  return line ? safeText(line, warnings, source) : undefined;
}

function extractProjectBullets(content: string, warnings: string[], source: string): string[] {
  const preferred =
    section(content, "Best 3-bullet resume version") ||
    section(content, "Best default bullets") ||
    section(content, "Current general resume bullets") ||
    section(content, "Strong Bullets");
  return bulletLines(preferred || content, warnings, source).slice(0, 5);
}

function extractClaims(content: string, warnings: string[], source: string): string[] {
  return bulletLines(section(content, "Claims to avoid"), warnings, source).slice(0, 8);
}

function extractMetrics(content: string, warnings: string[], source: string): string[] {
  return bulletLines(section(content, "Metrics to gather"), warnings, source).slice(0, 12);
}

function extractSkills(content: string, moduleId: string, warnings: string[], source: string): string[] {
  const stack = section(content, "Technical Stack") || section(content, "Tech Stack");
  const blocks = fencedBlocks(content).join("\n");
  const fromKnown = MODULE_KEYWORDS[moduleId] ?? [];
  const candidates = [...fromKnown, ...bulletLines(stack, warnings, source), ...blocks.split(/[,\n]/)]
    .map(stripMarkdown)
    .filter(Boolean)
    .filter((item) => item.length <= 40);
  return [...new Set(candidates)].slice(0, 12);
}

function moduleSummary(content: string, title: string, warnings: string[], source: string): string {
  const identity = section(content, "Project identity") || section(content, "Project Identity");
  const summaryLine = identity
    .split(/\r?\n/)
    .find((line) => /one-sentence summary/i.test(line) || /^### Summary/i.test(line));
  const fromLine = summaryLine?.replace(/^-\s*\*\*?One-sentence summary:\*\*?\s*/i, "");
  return (
    (fromLine ? safeText(fromLine, warnings, source) : undefined) ??
    firstSentence(section(content, "Summary"), warnings, source) ??
    `${title} resume module extracted from career-source.`
  );
}

function placementForModule(moduleId: string, title: string, order: number): ResumeModulePlacement {
  const details: Record<string, string> = {
    ev_tracker: "Next.js, FastAPI, Supabase, Docker",
    the_charter_ai_lab: "Python, Pytest, YAML, Rich/Textual",
    network_security_lab: "Python, Ghidra, GDB, Wireshark",
    auditwiseai: "Python, OpenAI API, RBAC, audit logging",
    javafx_secure_user_management: "Java, JavaFX, AES, RBAC",
    c_phone_directory: "C, file I/O, data structures",
    cpp_modular_text_adventure: "C++, OOP, modular game systems"
  };
  return {
    section: "projects",
    heading: title,
    detail: details[moduleId],
    date: "2024-2026",
    order
  };
}

function buildProjectModule(file: CareerSourceMarkdownFile, warnings: string[]): CareerPackResumeModule {
  const normalizedPath = normalizePath(file.path);
  const id = slugify(normalizedPath.replace(/^projects\//, "").replace(/\.md$/, ""));
  const title = headingTitle(file.content, id.replace(/_/g, " "));
  const bullets = extractProjectBullets(file.content, warnings, normalizedPath);
  const claimsToAvoid = extractClaims(file.content, warnings, normalizedPath);
  const metricsToGather = extractMetrics(file.content, warnings, normalizedPath);
  const proof = bulletLines(section(file.content, "Evidence source") || section(file.content, "Evidence"), warnings, normalizedPath).slice(0, 8);
  const order = MODULE_ORDER.includes(id) ? MODULE_ORDER.indexOf(id) + 10 : MODULE_ORDER.length + 20;

  return {
    id,
    title,
    category: "project",
    summary: moduleSummary(file.content, title, warnings, normalizedPath),
    tags: [...new Set([...(MODULE_ROLE_TAGS[id] ?? ["software"]), ...(MODULE_KEYWORDS[id] ?? [])])],
    skills: extractSkills(file.content, id, warnings, normalizedPath),
    bullets,
    bestFor: MODULE_ROLE_TAGS[id] ?? ["software"],
    proof: proof.length > 0 ? proof : [`Source-backed module from ${normalizedPath}.`],
    sourceFiles: [normalizedPath],
    confidence: claimsToAvoid.length > 0 || metricsToGather.length > 0 ? "medium-high" : "medium",
    claimsToAvoid,
    metricsToGather,
    isActive: true,
    resumePlacement: placementForModule(id, title, order)
  };
}

function parseProjectOrder(content: string): string[] {
  return section(content, "Project order")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) =>
      slugify(
        line
          .replace(/^\d+\.\s+/, "")
          .split(" as ")[0]
          .split(" or ")[0]
          .split("/")[0]
      )
    )
    .map((id) => {
      if (id === "the_charter") {
        return "the_charter_ai_lab";
      }
      if (id === "network_security") {
        return "network_security_lab";
      }
      return id;
    });
}

function extractCodeBlockAfter(content: string, heading: string): string | undefined {
  const target = section(content, heading);
  return fencedBlocks(target)[0];
}

function parseSkillsBlock(block: string | undefined): string[] {
  if (!block) {
    return [];
  }
  return block
    .split(/\r?\n/)
    .flatMap((line) => line.replace(/^[^:]+:\s*/, "").split(","))
    .map(stripMarkdown)
    .filter(Boolean);
}

function buildRoleRecipe(file: CareerSourceMarkdownFile, warnings: string[]): CareerPackRoleRecipe {
  const normalizedPath = normalizePath(file.path);
  const id = slugify(normalizedPath.replace(/^roles\//, "").replace(/\.md$/, ""));
  const title = headingTitle(file.content, id.replace(/_/g, " "));
  const preferredModuleIds = parseProjectOrder(file.content).filter(Boolean);
  const summaryAngle =
    extractCodeBlockAfter(file.content, "Summary")
      ?.split(/\r?\n/)
      .map((line) => safeText(line, warnings, normalizedPath))
      .filter(Boolean)
      .join(" ") || `${title} resume angle.`;
  const skillsToEmphasize = parseSkillsBlock(extractCodeBlockAfter(file.content, "Skills")).slice(0, 18);
  const bulletsToPrefer = bulletLines(file.content, warnings, normalizedPath).filter((line) => /built|engineered|implemented|developed|completed|reverse/i.test(line)).slice(0, 8);
  const claimsToAvoid = bulletLines(section(file.content, "Cut list"), warnings, normalizedPath);

  return {
    id,
    title,
    roleTypes: ROLE_TYPE_BY_ROLE_ID[id] ?? ["software"],
    summaryAngle,
    targetKeywords: ROLE_KEYWORDS[id] ?? [],
    negativeKeywords: ROLE_NEGATIVE_KEYWORDS,
    preferredModuleIds: preferredModuleIds.length > 0 ? preferredModuleIds : ["ev_tracker"],
    secondaryModuleIds: MODULE_ORDER.filter((moduleId) => !preferredModuleIds.includes(moduleId)).slice(0, 3),
    skillsToEmphasize,
    bulletsToPrefer,
    claimsToAvoid,
    fitNotes: bulletLines(section(file.content, "Target story"), warnings, normalizedPath).slice(0, 3),
    sourceFiles: [normalizedPath]
  };
}

function buildEducationModule(warnings: string[]): CareerPackResumeModule {
  return {
    id: "asu_computer_science",
    title: "Arizona State University - B.S. Computer Science",
    category: "education",
    summary: "B.S. Computer Science with cybersecurity emphasis.",
    tags: ["software", "cybersecurity", "education"],
    skills: ["Computer Science", "Cybersecurity", "Software Engineering"],
    bullets: ["Cybersecurity emphasis; GPA should be confirmed before final resume use."],
    bestFor: ["software", "cybersecurity", "it", "full_stack"],
    proof: ["Source inventory notes GPA inconsistency to verify."],
    sourceFiles: ["source_inventory.md"],
    confidence: "medium",
    claimsToAvoid: ["Do not publish GPA until 3.31 vs 3.32 is confirmed."],
    metricsToGather: ["Confirm final GPA: 3.31 vs 3.32."],
    isActive: true,
    resumePlacement: {
      section: "education",
      heading: "Arizona State University",
      detail: "B.S. Computer Science, Cybersecurity Emphasis",
      date: "2026",
      order: 0
    }
  };
}

function buildSkillsModule(files: CareerSourceMarkdownFile[], warnings: string[]): CareerPackResumeModule {
  const file = findFile(files, "bullet_banks/summaries_and_skills.md");
  const generalSkills = parseSkillsBlock(file ? extractCodeBlockAfter(file.content, "Skills blocks") ?? fencedBlocks(file.content)[1] : undefined);
  return {
    id: "technical_skills_general",
    title: "Technical Skills",
    category: "skill_cluster",
    summary: "Canonical technical skills block extracted from career-source.",
    tags: ["software", "full_stack", "cybersecurity", "data_finance"],
    skills: [...new Set(generalSkills.length > 0 ? generalSkills : ["Python", "TypeScript", "FastAPI", "React", "PostgreSQL", "Linux"])].slice(0, 30),
    bullets: [],
    bestFor: ["software", "full_stack", "cybersecurity", "data_finance", "it"],
    proof: ["Source-backed skills block from bullet_banks/summaries_and_skills.md."],
    sourceFiles: ["bullet_banks/summaries_and_skills.md"],
    confidence: "medium-high",
    claimsToAvoid: [],
    metricsToGather: [],
    isActive: true,
    resumePlacement: {
      section: "skills",
      heading: "Technical",
      order: 0
    }
  };
}

function buildExperienceModules(warnings: string[]): CareerPackResumeModule[] {
  return [
    {
      id: "legoland_robotics",
      title: "LEGOLAND California - Robotics / Guest Operations",
      category: "experience",
      summary: "Customer-facing robotics and high-traffic operations experience.",
      tags: ["operations", "communication", "robotics", "it"],
      skills: ["Communication", "Operations", "Teamwork", "Robotics"],
      bullets: ["Supported guest-facing robotics experiences and coordinated with teams under live operational pressure."],
      bestFor: ["it", "other"],
      proof: ["Referenced by current resume inventory."],
      sourceFiles: ["source_inventory.md", "MASTER_RESUME.md"],
      confidence: "medium",
      claimsToAvoid: [],
      metricsToGather: [],
      isActive: true,
      resumePlacement: {
        section: "additional_experience",
        heading: "LEGOLAND California",
        detail: "Robotics / Guest Operations",
        date: "2023-2024",
        order: 10
      }
    },
    {
      id: "soda_student_org",
      title: "Software Developers Association - Student Involvement",
      category: "experience",
      summary: "Software community and extracurricular involvement.",
      tags: ["software", "community", "leadership"],
      skills: ["Collaboration", "Software Development", "Communication"],
      bullets: ["Participated in software-focused student community and project-oriented career development activities."],
      bestFor: ["software", "full_stack", "other"],
      proof: ["Referenced by current resume inventory."],
      sourceFiles: ["source_inventory.md", "MASTER_RESUME.md"],
      confidence: "medium",
      claimsToAvoid: [],
      metricsToGather: [],
      isActive: true,
      resumePlacement: {
        section: "additional_experience",
        heading: "Software Developers Association",
        detail: "Student Involvement",
        date: "2024-2026",
        order: 20
      }
    }
  ];
}

function buildClaimsSafety(files: CareerSourceMarkdownFile[], warnings: string[]): CareerPackClaimsSafety {
  const file = findFile(files, "notes/claims_to_avoid.md");
  const bullets = file ? bulletLines(file.content, warnings, file.path) : [];
  return {
    globalClaimsToAvoid: bullets.slice(0, 12),
    safePhrasingRules: [
      "Prefer precise, evidence-backed technical claims.",
      "Use project, lab, or controlled-environment wording when experience is not professional employment.",
      "Do not add exact metrics until they are verified in source material."
    ],
    unsupportedClaims: bullets.filter((line) => /do not|avoid/i.test(line)).slice(0, 12),
    needsEvidenceBeforeUsing: [
      "Exact user counts, active accounts, uptime, latency, revenue, data volume, or performance percentages.",
      "Production health and deployment status.",
      "Full-suite test pass claims when source notes say verification is pending."
    ]
  };
}

function moduleIdFromMetricHeading(heading: string): string {
  const id = slugify(heading);
  if (id === "the_charter") {
    return "the_charter_ai_lab";
  }
  if (id === "older_projects") {
    return "cpp_modular_text_adventure";
  }
  return id === "general_profile" ? "asu_computer_science" : id;
}

function buildMetrics(files: CareerSourceMarkdownFile[], warnings: string[]): CareerPackMetricToGather[] {
  const file = findFile(files, "notes/metrics_to_gather.md");
  if (!file) {
    return [];
  }
  const lines = file.content.split(/\r?\n/);
  const result: CareerPackMetricToGather[] = [];
  let currentModuleId = "general_profile";
  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentModuleId = moduleIdFromMetricHeading(line.replace(/^##\s+/, ""));
      continue;
    }
    if (!line.trim().startsWith("- ")) {
      continue;
    }
    const metric = safeText(line.trim().slice(2), warnings, file.path);
    if (!metric) {
      continue;
    }
    result.push({
      moduleId: currentModuleId,
      metric,
      whyItMatters: "Needed before using stronger resume claims.",
      status: "missing"
    });
  }
  return result;
}

function buildInterviewStories(files: CareerSourceMarkdownFile[], warnings: string[]): CareerPackInterviewStory[] {
  const file = findFile(files, "notes/interview_story_bank.md");
  if (!file) {
    return [];
  }
  const stories: CareerPackInterviewStory[] = [];
  const chunks = file.content.split(/\n##\s+/).slice(1);
  for (const chunk of chunks) {
    const [rawTitle, ...bodyLines] = chunk.split(/\r?\n/);
    const title = safeText(rawTitle, warnings, file.path);
    if (!title) {
      continue;
    }
    const body = bodyLines.join("\n");
    const pick = (label: string) => {
      const line = body.split(/\r?\n/).find((item) => item.trim().toLowerCase().startsWith(`- ${label.toLowerCase()}:`));
      return line ? safeText(line.replace(new RegExp(`^- ${label}:\\s*`, "i"), ""), warnings, file.path) : undefined;
    };
    const situation = pick("Situation");
    const action = pick("Action");
    const result = pick("Result");
    if (!situation || !action || !result) {
      continue;
    }
    stories.push({
      id: slugify(title),
      title,
      themes: title.toLowerCase().includes("security") ? ["security"] : ["software"],
      modules: MODULE_ORDER.filter((moduleId) => title.toLowerCase().includes(moduleId.split("_")[0])),
      situation,
      action,
      result,
      sourceFiles: [file.path]
    });
  }
  return stories;
}

function buildPositioning(files: CareerSourceMarkdownFile[], warnings: string[]): CareerSourcePackV1["careerPositioning"] {
  const readme = findFile(files, "README.md");
  const summaries = findFile(files, "bullet_banks/summaries_and_skills.md");
  const summary =
    (summaries ? extractCodeBlockAfter(summaries.content, "Summary options") : undefined)
      ?.split(/\r?\n/)
      .map((line) => safeText(line, warnings, "bullet_banks/summaries_and_skills.md"))
      .filter(Boolean)
      .join(" ") ||
    "Recent B.S. Computer Science graduate with software, security, and full-stack project experience.";
  return {
    headline: "Source-backed software, security, and full-stack resume pack",
    summary,
    currentPositioning: readme ? bulletLines(section(readme.content, "Current positioning"), warnings, readme.path).slice(0, 6) : [],
    bestDefaultProjectOrder: ["ev_tracker", "the_charter_ai_lab", "network_security_lab", "auditwiseai"],
    defaultResumeFormula: [
      "Header",
      "Summary / Technical Profile",
      "Education",
      "Technical Skills",
      "Projects",
      "Additional Experience & Activities"
    ],
    privacyNotes: [
      "Generated from local private career-source Markdown.",
      "Keep generated real packs in resume_pack/ only."
    ]
  };
}

function buildJobScoutFilters(roleRecipes: CareerPackRoleRecipe[], resumeModules: CareerPackResumeModule[]): CareerSourcePackV1["jobScoutFilters"] {
  return {
    roleRecipeFilters: roleRecipes.map((recipe) => recipe.id),
    projectMatchFilters: resumeModules.filter((module) => module.category === "project").map((module) => module.id),
    skillFilters: [...new Set(resumeModules.flatMap((module) => module.skills))].slice(0, 40),
    locationPreferenceNotes: ["Use job posting location and remote/hybrid terms manually."],
    seniorityPositiveSignals: ["new grad", "junior", "associate", "entry-level", "early career", "graduate", "software engineer i"],
    seniorityNegativeSignals: ["senior", "staff", "principal", "lead engineer", "manager", "10+ years", "15+ years"],
    clearanceSignals: ["clearance eligible", "able to obtain clearance", "u.s. citizen", "defense", "aerospace", "dod"],
    publicSectorSignals: ["county", "public sector", "government", "federal", "it analyst"],
    excludeOrCautionSignals: ROLE_NEGATIVE_KEYWORDS
  };
}

function buildMatchingHints(roleRecipes: CareerPackRoleRecipe[], resumeModules: CareerPackResumeModule[]): CareerSourcePackV1["matchingHints"] {
  return {
    roleKeywordMap: Object.fromEntries(roleRecipes.map((recipe) => [recipe.id, recipe.targetKeywords])),
    moduleKeywordMap: Object.fromEntries(resumeModules.map((module) => [module.id, MODULE_KEYWORDS[module.id] ?? module.skills.slice(0, 8)])),
    strongFitCombinations: roleRecipes.map((recipe) => ({
      roleRecipeId: recipe.id,
      moduleIds: recipe.preferredModuleIds.slice(0, 2),
      reason: `${recipe.title} prefers ${recipe.preferredModuleIds.slice(0, 2).join(" + ")}.`
    })),
    weakFitWarnings: ROLE_NEGATIVE_KEYWORDS.map((signal) => ({
      signal,
      reason: "Caution signal for the current early-career resume positioning."
    }))
  };
}

export function buildCareerSourcePackFromMarkdown(input: BuildCareerSourcePackInput): BuildCareerSourcePackResult {
  const files = input.files.map((file) => ({ path: normalizePath(file.path), content: file.content }));
  const warnings: string[] = [];
  for (const file of files) {
    if (EMAIL_PATTERN.test(file.content)) {
      warnings.push(`Possible email address detected in ${file.path}.`);
    }
    if (PHONE_PATTERN.test(file.content)) {
      warnings.push(`Possible phone number detected in ${file.path}.`);
    }
  }

  const projectModules = filesIn(files, "projects/")
    .filter((file) => file.path.endsWith(".md"))
    .map((file) => buildProjectModule(file, warnings));
  const resumeModules = [
    buildEducationModule(warnings),
    buildSkillsModule(files, warnings),
    ...projectModules,
    ...buildExperienceModules(warnings)
  ];
  const roleRecipes = filesIn(files, "roles/")
    .filter((file) => file.path.endsWith(".md"))
    .map((file) => buildRoleRecipe(file, warnings));

  const pack: CareerSourcePackV1 = {
    careerPositioning: buildPositioning(files, warnings),
    resumeModules,
    roleRecipes,
    jobScoutFilters: buildJobScoutFilters(roleRecipes, resumeModules),
    claimsSafety: buildClaimsSafety(files, warnings),
    metricsToGather: buildMetrics(files, warnings),
    interviewStories: buildInterviewStories(files, warnings),
    matchingHints: buildMatchingHints(roleRecipes, resumeModules),
    extractionMetadata: {
      schemaVersion: 1,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      sourceRepo: input.sourceRepo ?? "career-source-local",
      filesScanned: files.map((file) => file.path).sort(),
      filesMissing: [],
      warnings: [...new Set(warnings)]
    }
  };

  const validation = parseCareerSourcePackJson(JSON.stringify(pack));
  if (!validation.ok) {
    return { ok: false, error: validation.error, warnings: [...new Set(warnings)] };
  }
  return {
    ok: true,
    pack: validation.pack,
    warnings: [...new Set([...warnings, ...validation.warnings])]
  };
}
