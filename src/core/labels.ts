import type {
  CardState,
  JobCandidateOrigin,
  JobCandidateStatus,
  JobSourceCadence,
  JobSourceKind,
  JobSourceRunStatus,
  LifeArea,
  LogType,
  ResumeModuleCategory,
  RoleType,
  Warmth
} from "./types";

export const AREA_LABELS: Record<LifeArea, string> = {
  build: "Build",
  body: "Body",
  money_independence: "Money / Independence",
  social_career: "Social / Career",
  stability_vices: "Stability / Vices"
};

export const WARMTH_LABELS: Record<Warmth, string> = {
  hot: "Hot",
  warm: "Warm",
  cooling: "Cooling",
  cold: "Cold",
  dormant: "Dormant"
};

export const CARD_STATE_LABELS: Record<CardState, string> = {
  inbox: "Inbox",
  active: "Active",
  parked: "Parked",
  waiting: "Waiting",
  done: "Done",
  killed: "Killed"
};

export const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  software: "Software",
  cybersecurity: "Cybersecurity",
  it: "IT",
  full_stack: "Full Stack",
  data_finance: "Data / Finance",
  other: "Other"
};

export const RESUME_MODULE_CATEGORY_LABELS: Record<ResumeModuleCategory, string> = {
  project: "Project",
  experience: "Experience",
  education: "Education",
  skill_cluster: "Skill Cluster",
  certification: "Certification"
};

export const JOB_SOURCE_KIND_LABELS: Record<JobSourceKind, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  governmentjobs: "GovernmentJobs / NEOGOV",
  jobposting_jsonld: "JobPosting JSON-LD",
  company_careers: "Company Careers",
  manual: "Manual"
};

export const JOB_SOURCE_CADENCE_LABELS: Record<JobSourceCadence, string> = {
  manual: "Manual",
  daily: "Daily",
  weekly: "Weekly"
};

export const JOB_CANDIDATE_STATUS_LABELS: Record<JobCandidateStatus, string> = {
  new: "New",
  saved: "Saved",
  dismissed: "Dismissed",
  card_created: "Card Created"
};

export const JOB_CANDIDATE_ORIGIN_LABELS: Record<JobCandidateOrigin, string> = {
  manual: "Manual",
  source_fetch: "Source Fetch",
  import: "Import",
  agent: "Agent"
};

export const FIT_SCORE_DISCLAIMER = "Deterministic keyword match, not final judgment.";

export const JOB_SOURCE_RUN_STATUS_LABELS: Record<JobSourceRunStatus, string> = {
  idle: "Idle",
  running: "Running",
  success: "Success",
  error: "Error"
};

export const APPROVED_SOURCE_FETCHING_BANNER =
  "Approved-source fetching is manual-run only. One configured URL per run. No logins, no auto-apply.";

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  win: "Win",
  leak: "Leak",
  idea: "Idea",
  pounce: "Pounce",
  salvage: "Salvage",
  mvd: "Minimum Viable Day",
  clarity: "Clarity",
  calibration: "Calibration"
};
