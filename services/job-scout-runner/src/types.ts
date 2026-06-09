export type {
  JobCandidate,
  JobSource,
  JobSourceRunResult,
  ResumeModule
} from "../../../src/core/types";

export type { JobSourceRunOutput } from "../../../src/core/jobSourceRunner";

export interface RunSourceRequestBody {
  source: import("../../../src/core/types").JobSource;
  existingCandidates: import("../../../src/core/types").JobCandidate[];
  resumeModules: import("../../../src/core/types").ResumeModule[];
}

export interface RunSourceResponseBody {
  result: import("../../../src/core/types").JobSourceRunResult;
  candidates: import("../../../src/core/types").JobCandidate[];
  updatedSourcePatch: Partial<import("../../../src/core/types").JobSource>;
}

export interface ErrorResponseBody {
  error: string;
}
