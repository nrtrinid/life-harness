import { createJobCandidate, createResumeModule } from "../core/jobScout";
import type { JobCandidate, JobSource, ResumeModule } from "../core/types";

export const seedResumeModules: ResumeModule[] = [
  createResumeModule({
    id: "resume-ev-tracker",
    title: "EV Tracker / Kalshi",
    category: "project",
    summary: "Market analysis tooling with real decision pressure and fair-value notes.",
    tags: ["markets", "analysis", "kalshi", "decision-making"],
    bullets: [
      "Built market review workflow with fair-value notes",
      "Used Python to analyze market pricing signals"
    ],
    skills: ["Python", "analysis", "markets"],
    projects: ["EV Tracker"],
    bestFor: ["data_finance", "software", "full_stack"],
    proof: ["Wrote one fair-value market note"],
    isActive: true
  }),
  createResumeModule({
    id: "resume-text-rpg",
    title: "Text RPG",
    category: "project",
    summary: "Creative game systems with tests and enemy behavior work.",
    tags: ["game-dev", "typescript", "testing"],
    bullets: [
      "Implemented enemy behavior tests for combat loop",
      "Maintained creative project with low-friction re-entry"
    ],
    skills: ["TypeScript", "testing", "game systems"],
    projects: ["Text RPG"],
    bestFor: ["software", "full_stack"],
    isActive: true
  }),
  createResumeModule({
    id: "resume-life-harness",
    title: "Life Harness / A770 Local Scout",
    category: "project",
    summary: "Executive-function board and local AI gateway experimentation.",
    tags: ["react-native", "expo", "product", "local-ai"],
    bullets: [
      "Scaffolded career-first Momentum Board v0.1",
      "Kept local AI gateway separate from v0.1 app dependencies"
    ],
    skills: ["TypeScript", "React", "FastAPI", "product design"],
    projects: ["Life Harness"],
    bestFor: ["software", "full_stack", "it"],
    isActive: true
  }),
  createResumeModule({
    id: "resume-legoland",
    title: "Legoland Robotics / Customer-Facing",
    category: "experience",
    summary: "Customer-facing robotics and teamwork in a high-traffic environment.",
    tags: ["customer-service", "robotics", "teamwork"],
    bullets: [
      "Supported guest-facing robotics experiences",
      "Worked with team under live operational pressure"
    ],
    skills: ["communication", "teamwork", "operations"],
    bestFor: ["it", "other"],
    isActive: true
  }),
  createResumeModule({
    id: "resume-in-n-out",
    title: "In-N-Out Operations / Teamwork",
    category: "experience",
    summary: "Fast-paced operations, reliability, and team coordination.",
    tags: ["operations", "teamwork", "reliability"],
    bullets: [
      "Maintained pace and quality under rush conditions",
      "Coordinated with crew on repeatable operational tasks"
    ],
    skills: ["operations", "teamwork", "reliability"],
    bestFor: ["it", "other"],
    isActive: true
  }),
  createResumeModule({
    id: "resume-asu",
    title: "ASU Computer Science / Cybersecurity",
    category: "education",
    summary: "Computer science foundation with cybersecurity coursework.",
    tags: ["computer-science", "cybersecurity", "education"],
    bullets: [
      "Studied computer science with security-focused coursework",
      "Applied security concepts to project work"
    ],
    skills: ["computer science", "cybersecurity", "security"],
    bestFor: ["software", "cybersecurity", "it", "full_stack"],
    isActive: true
  }),
  createResumeModule({
    id: "resume-tech-skills",
    title: "Technical Skills: Python / TypeScript / FastAPI / React / Postgres",
    category: "skill_cluster",
    summary: "Core stack for product and backend work.",
    tags: ["python", "typescript", "react", "fastapi", "postgres"],
    bullets: [
      "Built APIs with FastAPI and Postgres",
      "Shipped React and React Native interfaces in TypeScript"
    ],
    skills: ["Python", "TypeScript", "React", "FastAPI", "Postgres"],
    bestFor: ["software", "full_stack", "data_finance"],
    isActive: true
  }),
  createResumeModule({
    id: "resume-security-dev",
    title: "Security-Aware Development",
    category: "certification",
    summary: "Security-minded engineering habits and application security awareness.",
    tags: ["security", "application-security", "secure-development"],
    bullets: [
      "Applied security-aware development practices in project work",
      "Reviewed application security requirements in job contexts"
    ],
    skills: ["security", "application security", "secure development"],
    bestFor: ["cybersecurity", "software", "it"],
    isActive: true
  })
];

const REGISTRY_ONLY_NOTES =
  "Registry only — set a supported kind (greenhouse/lever/ashby/jobposting_jsonld/manual) and a public URL before running.";

export const seedJobSources: JobSource[] = [
  {
    id: "source-fixture-greenhouse",
    name: "Local Fixture Source",
    url: "/fixtures/sample-greenhouse.json",
    kind: "greenhouse",
    enabled: true,
    cadence: "manual",
    maxResults: 25,
    runStatus: "idle",
    adapterNotes:
      "Demo fixture — web only. Real sources need a public CORS-friendly JSON URL."
  },
  {
    id: "source-microsoft",
    name: "Microsoft Careers",
    url: "https://careers.microsoft.com/",
    kind: "company_careers",
    enabled: false,
    cadence: "manual",
    adapterNotes: REGISTRY_ONLY_NOTES
  },
  {
    id: "source-northrop",
    name: "Northrop Grumman Careers",
    url: "https://jobs.northropgrumman.com/",
    kind: "company_careers",
    enabled: false,
    cadence: "manual",
    adapterNotes: REGISTRY_ONLY_NOTES
  },
  {
    id: "source-viasat",
    name: "Viasat Careers",
    url: "https://careers.viasat.com/",
    kind: "company_careers",
    enabled: false,
    cadence: "manual",
    adapterNotes: REGISTRY_ONLY_NOTES
  },
  {
    id: "source-qualcomm",
    name: "Qualcomm Careers",
    url: "https://careers.qualcomm.com/",
    kind: "company_careers",
    enabled: false,
    cadence: "manual",
    adapterNotes: REGISTRY_ONLY_NOTES
  },
  {
    id: "source-county-jobs",
    name: "County Jobs",
    url: "https://example.com/county-jobs",
    kind: "manual",
    enabled: false,
    cadence: "manual",
    adapterNotes: "Paste a public JSON URL before running."
  },
  {
    id: "source-manual",
    name: "Generic Manual Source",
    url: "manual://paste",
    kind: "manual",
    enabled: false,
    cadence: "manual",
    notes: "Use Candidate Intake for pasted postings.",
    adapterNotes: "Set a public JSON URL to run as manual adapter."
  }
];

const sampleCandidate = createJobCandidate(
  {
    company: "Northrop Grumman",
    roleTitle: "Software Engineer — Security",
    sourceUrl: "https://jobs.northropgrumman.com/example",
    location: "Remote",
    description:
      "Seeking software engineer with Python, TypeScript, React, security, application security, and secure development experience.",
    roleType: "cybersecurity",
    sourceId: "source-northrop",
    origin: "manual"
  },
  seedResumeModules,
  "saved"
);

sampleCandidate.id = "candidate-northrop-security";

export const seedJobCandidates: JobCandidate[] = [sampleCandidate];
