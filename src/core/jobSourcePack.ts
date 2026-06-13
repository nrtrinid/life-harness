import type { JobSource, JobSourcePack } from "./types";

export function applyPackModeToSources(sources: JobSource[], mode: JobSourcePack): JobSource[] {
  return sources.map((source) => {
    if (source.sourcePack !== "full") {
      return source;
    }
    return { ...source, enabled: mode === "full" };
  });
}
