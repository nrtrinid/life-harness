import { createJobCandidate, createResumeModule } from "../core/jobScout";
import { NORTHROP_WORKDAY_CXS_URL } from "../core/jobSourceHealth";
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
    isActive: true,
    resumePlacement: {
      section: "projects",
      heading: "EV Tracker / Kalshi Market Tooling",
      detail: "Python, market analysis, fair-value notes",
      date: "2025 - 2026",
      order: 20
    }
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
    isActive: true,
    resumePlacement: {
      section: "projects",
      heading: "Text RPG Systems",
      detail: "TypeScript, testing, game systems",
      date: "2025 - 2026",
      order: 30
    }
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
    isActive: true,
    resumePlacement: {
      section: "projects",
      heading: "Life Harness / Local Scout",
      detail: "React Native, TypeScript, FastAPI",
      date: "2026",
      order: 10
    }
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
    isActive: true,
    resumePlacement: {
      section: "additional_experience",
      heading: "Legoland Robotics / Customer-Facing Operations",
      detail: "Guest-facing robotics and team operations",
      date: "Prior Experience",
      order: 10
    }
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
    isActive: true,
    resumePlacement: {
      section: "additional_experience",
      heading: "In-N-Out Operations / Teamwork",
      detail: "Fast-paced operations and reliability",
      date: "Prior Experience",
      order: 20
    }
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
    isActive: true,
    resumePlacement: {
      section: "education",
      heading: "Arizona State University",
      detail: "Computer Science, Cybersecurity coursework",
      date: "Expected 2026",
      order: 10
    }
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
    isActive: true,
    resumePlacement: {
      section: "skills",
      heading: "Technical",
      detail: "Python, TypeScript, React, FastAPI, Postgres",
      order: 10
    }
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
    isActive: true,
    resumePlacement: {
      section: "additional_experience",
      heading: "Security-Aware Development",
      detail: "Application security and secure development habits",
      date: "2025 - 2026",
      order: 30
    }
  })
];

const REGISTRY_ONLY_NOTES =
  "Registry only — set a supported kind (greenhouse/lever/ashby/jobposting_jsonld/manual) and a public URL before running.";

const STARTER_MAX_RESULTS = 25;

const STARTER_GREENHOUSE_NOTE =
  "Starter pack — Greenhouse public API with job descriptions (content=true).";

const STARTER_LEVER_NOTE = "Starter pack — Lever public postings API.";

const STARTER_ASHBY_NOTE = "Starter pack — Ashby public job board API.";

const STARTER_GOVERNMENTJOBS_NOTE =
  "Public-sector board — first page of agency listings via GovernmentJobs listing endpoint.";

function starterGovernmentJobsSource(id: string, name: string, agency: string): JobSource {
  return {
    id,
    name,
    url: `https://www.governmentjobs.com/careers/${agency}`,
    kind: "governmentjobs",
    enabled: true,
    cadence: "manual",
    maxResults: STARTER_MAX_RESULTS,
    runStatus: "idle",
    adapterNotes: STARTER_GOVERNMENTJOBS_NOTE
  };
}

function starterGreenhouseSource(id: string, name: string, slug: string): JobSource {
  return {
    id,
    name,
    url: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
    kind: "greenhouse",
    enabled: true,
    cadence: "manual",
    maxResults: STARTER_MAX_RESULTS,
    runStatus: "idle",
    adapterNotes: STARTER_GREENHOUSE_NOTE
  };
}

function starterLeverSource(id: string, name: string, company: string): JobSource {
  return {
    id,
    name,
    url: `https://api.lever.co/v0/postings/${company}?mode=json`,
    kind: "lever",
    enabled: true,
    cadence: "manual",
    maxResults: STARTER_MAX_RESULTS,
    runStatus: "idle",
    adapterNotes: STARTER_LEVER_NOTE
  };
}

function starterAshbySource(id: string, name: string, org: string): JobSource {
  return {
    id,
    name,
    url: `https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`,
    kind: "ashby",
    enabled: true,
    cadence: "manual",
    maxResults: STARTER_MAX_RESULTS,
    runStatus: "idle",
    adapterNotes: STARTER_ASHBY_NOTE
  };
}

/** Enabled runnable sources merged into persisted state when missing. */
export const STARTER_JOB_SOURCE_IDS = [
  "source-netskope",
  "source-opswat",
  "source-spacex",
  "source-secureframe",
  "source-weride",
  "source-mechanical-orchard",
  "source-notion",
  "source-eliseai",
  "source-cohere",
  "source-radiant",
  "source-northrop-workday-cxs",
  "source-sd-county",
  "source-city-sandiego",
  "source-la-county",
  "source-orange-county"
] as const;

export const seedJobSources: JobSource[] = [
  {
    id: "source-fixture-greenhouse",
    name: "Local Fixture Source",
    url: "/fixtures/sample-greenhouse.json",
    kind: "greenhouse",
    enabled: false,
    cadence: "manual",
    maxResults: 25,
    runStatus: "idle",
    adapterNotes:
      "Demo fixture — web only. Re-enable for offline testing without network fetches."
  },
  starterGreenhouseSource("source-netskope", "Netskope", "netskope"),
  starterGreenhouseSource("source-opswat", "OPSWAT", "opswat"),
  starterGreenhouseSource("source-spacex", "SpaceX", "spacex"),
  starterLeverSource("source-secureframe", "Secureframe", "secureframe"),
  starterLeverSource("source-weride", "WeRide", "weride"),
  starterLeverSource("source-mechanical-orchard", "Mechanical Orchard", "mechanicalorchard"),
  starterAshbySource("source-notion", "Notion", "notion"),
  starterAshbySource("source-eliseai", "EliseAI", "eliseai"),
  starterAshbySource("source-cohere", "Cohere", "cohere"),
  starterAshbySource("source-radiant", "Radiant Industries", "radiant"),
  {
    id: "source-northrop-workday-cxs",
    name: "Northrop Grumman — Workday CXS",
    url: NORTHROP_WORKDAY_CXS_URL,
    kind: "workday",
    enabled: true,
    cadence: "manual",
    maxResults: STARTER_MAX_RESULTS,
    runStatus: "idle",
    adapterNotes:
      "Starter pack — Northrop Workday CXS search endpoint (POST, paginated).",
    requestConfig: {
      method: "POST",
      bodyJson: {
        appliedFacets: {},
        limit: 20,
        offset: 0,
        searchText: ""
      },
      pagination: {
        mode: "workday_offset",
        limit: 20,
        maxPages: 3
      }
    }
  },
  starterGovernmentJobsSource("source-sd-county", "County of San Diego", "sdcounty"),
  starterGovernmentJobsSource("source-city-sandiego", "City of San Diego", "sandiego"),
  starterGovernmentJobsSource("source-la-county", "Los Angeles County", "lacounty"),
  starterGovernmentJobsSource("source-orange-county", "Orange County", "oc"),
  {
    id: "source-camp-pendleton-mccs",
    name: "Camp Pendleton — MCCS Careers",
    url: "https://careers.usmc-mccs.org/",
    kind: "company_careers",
    enabled: false,
    cadence: "manual",
    notes:
      "MCCS civilian jobs — filter to MCB Camp Pendleton in their portal. Use Quick paste until an MCCS adapter exists.",
    adapterNotes:
      "Registry bookmark — careers.usmc-mccs.org is not adapter-supported yet."
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
