import type { JobSourceKind } from "../core/types";

export interface SourceCandidateExample {
  name: string;
  kind: JobSourceKind;
  url: string;
  notes: string;
  targetReason?: string;
}

/** Reference examples only — not enabled JobSources. Test before saving. */
export const SOURCE_CANDIDATE_EXAMPLES: SourceCandidateExample[] = [
  {
    name: "C3 AI",
    kind: "greenhouse",
    url: "https://boards.greenhouse.io/c3ai",
    notes: "Greenhouse hosted board — derives API URL on detect."
  },
  {
    name: "Netskope",
    kind: "greenhouse",
    url: "https://boards.greenhouse.io/netskope",
    notes: "Greenhouse hosted board."
  },
  {
    name: "OPSWAT",
    kind: "greenhouse",
    url: "https://boards.greenhouse.io/opswat",
    notes: "Greenhouse hosted board."
  },
  {
    name: "SpaceX",
    kind: "greenhouse",
    url: "https://boards.greenhouse.io/spacex",
    notes: "Greenhouse hosted board."
  },
  {
    name: "WeRide",
    kind: "lever",
    url: "https://jobs.lever.co/weride",
    notes: "Lever hosted jobs — derives api.lever.co JSON URL."
  },
  {
    name: "Secureframe",
    kind: "lever",
    url: "https://jobs.lever.co/secureframe",
    notes: "Lever hosted jobs."
  },
  {
    name: "Veeva",
    kind: "lever",
    url: "https://jobs.lever.co/veeva",
    notes: "Lever hosted jobs."
  },
  {
    name: "Mechanical Orchard",
    kind: "lever",
    url: "https://jobs.lever.co/mechanicalorchard",
    notes: "Lever hosted jobs."
  },
  {
    name: "Notion",
    kind: "ashby",
    url: "https://jobs.ashbyhq.com/notion",
    notes: "Ashby hosted jobs — derives posting-api URL."
  },
  {
    name: "EliseAI",
    kind: "ashby",
    url: "https://jobs.ashbyhq.com/eliseai",
    notes: "Ashby hosted jobs."
  },
  {
    name: "Radiant Industries",
    kind: "ashby",
    url: "https://jobs.ashbyhq.com/radiant",
    notes: "Ashby hosted jobs."
  },
  {
    name: "Cohere",
    kind: "ashby",
    url: "https://jobs.ashbyhq.com/cohere",
    notes: "Ashby hosted jobs."
  },
  {
    name: "TRM Labs",
    kind: "ashby",
    url: "https://jobs.ashbyhq.com/trmlabs",
    notes: "Ashby hosted jobs."
  },
  {
    name: "Cherry Technologies",
    kind: "ashby",
    url: "https://jobs.ashbyhq.com/cherry",
    notes: "Ashby hosted jobs."
  },
  {
    name: "GovernmentJobs Fixture (local)",
    kind: "governmentjobs",
    url: "/fixtures/sample-governmentjobs-listing.html",
    notes: "Use this example → Test Source. No live network. Kind is set automatically."
  },
  {
    name: "County of San Diego",
    kind: "governmentjobs",
    url: "https://www.governmentjobs.com/careers/sdcounty",
    notes: "GovernmentJobs / NEOGOV — listing HTML parsed defensively. Test before saving."
  },
  {
    name: "City of San Diego",
    kind: "governmentjobs",
    url: "https://www.governmentjobs.com/careers/sandiego",
    notes: "GovernmentJobs / NEOGOV public-sector careers page."
  },
  {
    name: "Los Angeles County",
    kind: "governmentjobs",
    url: "https://www.governmentjobs.com/careers/lacounty",
    notes: "GovernmentJobs / NEOGOV public-sector careers page."
  },
  {
    name: "Orange County",
    kind: "governmentjobs",
    url: "https://www.governmentjobs.com/careers/oc",
    notes: "GovernmentJobs / NEOGOV public-sector careers page."
  },
  {
    name: "Camp Pendleton — MCCS",
    kind: "company_careers",
    url: "https://careers.usmc-mccs.org/",
    notes:
      "MCCS civilian careers (filter to MCB Camp Pendleton). Registry bookmark — not runnable until an MCCS adapter exists."
  },
  {
    name: "iCIMS Fixture (local)",
    kind: "icims",
    url: "/fixtures/sample-icims-listing.html",
    notes: "Use this example → Test Source. No live network. Kind is set automatically."
  },
  {
    name: "Viasat — iCIMS",
    kind: "icims",
    url: "https://careers-viasat.icims.com/jobs/search?ss=1&in_iframe=1",
    notes:
      "Viasat iCIMS search — listing HTML parsed defensively. Live fetch may redirect to marketing site."
  },
  {
    name: "Workday Fixture (local)",
    kind: "workday",
    url: "/fixtures/sample-workday-search.json",
    notes: "Use this example → Test Source. No live network. Kind is set automatically."
  },
  {
    name: "Qualcomm — Workday CXS",
    kind: "workday",
    url: "https://qualcomm.wd12.myworkdayjobs.com/wday/cxs/qualcomm/External/jobs",
    notes:
      "Live Qualcomm CXS endpoint — use endpoint mode POST with workday_offset pagination. Site page URL also detects as Workday."
  },
  {
    name: "Northrop Grumman",
    kind: "workday",
    url: "https://ngc.wd1.myworkdayjobs.com/Northrop_Grumman_External_Site",
    notes: "Workday external site — live fetch may return HTML shell until endpoint discovery."
  },
  {
    name: "Workday Endpoint Fixture (local)",
    kind: "workday",
    url: "/fixtures/sample-workday-cxs-response.json",
    notes:
      "Endpoint-backed Workday fixture. Use endpoint mode → POST with body from sample-workday-cxs-request.json."
  },
  {
    name: "Workday (corporate)",
    kind: "workday",
    url: "https://workday.wd5.myworkdayjobs.com/Workday",
    notes: "Workday corporate careers — test before saving."
  }
];
