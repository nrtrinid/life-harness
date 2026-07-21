import { describe, expect, it } from "vitest";

import { reconcileFeatureSprintWorktreeCleanupState } from "./featureSprintRunner";

describe("reconcileFeatureSprintWorktreeCleanupState", () => {
  it("treats git absent + disk absent as cleaned", () => {
    expect(
      reconcileFeatureSprintWorktreeCleanupState({
        gitRegistered: false,
        filesystemExists: false
      })
    ).toEqual({
      status: "cleaned",
      ok: true,
      message: "Worktree already removed from Git and disk."
    });
  });

  it("classifies git absent + disk present as orphaned_on_disk", () => {
    const result = reconcileFeatureSprintWorktreeCleanupState({
      gitRegistered: false,
      filesystemExists: true
    });
    expect(result.status).toBe("orphaned_on_disk");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("files remain on disk");
  });

  it("classifies git present + disk absent as stale_git_registration", () => {
    const result = reconcileFeatureSprintWorktreeCleanupState({
      gitRegistered: true,
      filesystemExists: false
    });
    expect(result.status).toBe("stale_git_registration");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("stale Git worktree registration");
  });

  it("classifies git present + disk present as failed when not blocked", () => {
    const result = reconcileFeatureSprintWorktreeCleanupState({
      gitRegistered: true,
      filesystemExists: true
    });
    expect(result.status).toBe("failed");
    expect(result.ok).toBe(false);
  });

  it("preserves blocked when dirty gate fires", () => {
    const result = reconcileFeatureSprintWorktreeCleanupState({
      gitRegistered: true,
      filesystemExists: true,
      blocked: true,
      hadChanges: true
    });
    expect(result.status).toBe("blocked");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("force clean");
  });
});
