import type { JobSourceInput } from "../core/actions";
import { NORTHROP_WORKDAY_CXS_URL } from "../core/jobSourceHealth";
import type { JobSourcePaginationConfig } from "../core/types";

export interface WorkdayEndpointTemplate {
  id: string;
  name: string;
  kind: "workday";
  endpointUrl: string;
  method: "POST";
  bodyJson: Record<string, unknown>;
  notes: string;
  runnable: boolean;
  endpointNeeded?: boolean;
  defaultPagination?: JobSourcePaginationConfig;
  pageUrl?: string;
}

export const WORKDAY_CXS_BODY_TEMPLATE: Record<string, unknown> = {
  appliedFacets: {},
  limit: 20,
  offset: 0,
  searchText: ""
};

export const WORKDAY_ENDPOINT_TEMPLATES: WorkdayEndpointTemplate[] = [
  {
    id: "northrop-workday-cxs",
    name: "Northrop Grumman — Workday CXS",
    kind: "workday",
    endpointUrl: NORTHROP_WORKDAY_CXS_URL,
    method: "POST",
    bodyJson: { ...WORKDAY_CXS_BODY_TEMPLATE },
    notes:
      "Live Northrop CXS endpoint — dogfood returned 20 candidates with offset 0, limit 20, no cookies.",
    runnable: true,
    defaultPagination: {
      mode: "workday_offset",
      limit: 20,
      maxPages: 3
    }
  },
  {
    id: "workday-endpoint-fixture",
    name: "Workday Endpoint Fixture",
    kind: "workday",
    endpointUrl: "/fixtures/sample-workday-cxs-response.json",
    method: "POST",
    bodyJson: { ...WORKDAY_CXS_BODY_TEMPLATE },
    notes: "Local fixture for offline POST endpoint testing. Returns 2 candidates.",
    runnable: true,
    defaultPagination: {
      mode: "none"
    }
  },
  {
    id: "qualcomm-workday-guide",
    name: "Qualcomm — Workday",
    kind: "workday",
    endpointUrl: "",
    pageUrl: "https://qualcomm.wd12.myworkdayjobs.com/en-US/External",
    method: "POST",
    bodyJson: { ...WORKDAY_CXS_BODY_TEMPLATE },
    notes: "Qualcomm needs exact DevTools CXS endpoint capture.",
    runnable: false,
    endpointNeeded: true
  }
];

export function getWorkdayEndpointTemplate(id: string): WorkdayEndpointTemplate | undefined {
  return WORKDAY_ENDPOINT_TEMPLATES.find((template) => template.id === id);
}

export function isWorkdayTemplateRunnable(template: WorkdayEndpointTemplate): boolean {
  return template.runnable && template.endpointUrl.trim().length > 0;
}

export function applyWorkdayEndpointTemplate(
  template: WorkdayEndpointTemplate
): Partial<JobSourceInput> {
  if (!isWorkdayTemplateRunnable(template)) {
    return {
      name: template.name,
      kind: template.kind,
      url: template.pageUrl ?? "",
      cadence: "manual",
      notes: template.notes,
      adapterNotes: template.notes
    };
  }

  const pagination =
    template.defaultPagination?.mode === "workday_offset"
      ? template.defaultPagination
      : undefined;

  return {
    name: template.name,
    kind: template.kind,
    url: template.endpointUrl,
    cadence: "manual",
    notes: template.notes,
    adapterNotes: template.notes,
    requestConfig: {
      method: template.method,
      bodyJson: { ...template.bodyJson },
      pagination
    }
  };
}
