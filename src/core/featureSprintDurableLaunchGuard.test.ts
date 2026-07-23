import { describe, expect, it } from "vitest";

import {
  beginDurableLaunchGuard,
  createDurableLaunchMutex
} from "./featureSprintDurableLaunchGuard";

describe("featureSprintDurableLaunchGuard", () => {
  it("blocks same-tick reentry before any attempt id is created", () => {
    const mutex = createDurableLaunchMutex();
    const createdWhileHeld: string[] = [];
    const enter = beginDurableLaunchGuard({
      mutex,
      hasOpenAttempt: () => undefined
    });
    expect(enter.ok).toBe(true);
    if (!enter.ok) {
      return;
    }
    createdWhileHeld.push("only-one");
    const blocked = beginDurableLaunchGuard({
      mutex,
      hasOpenAttempt: () => undefined
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok === false) {
      expect(blocked.reason).toBe("mutex_held");
    }
    enter.release();
    expect(createdWhileHeld).toEqual(["only-one"]);

    // After release, a new entry is allowed.
    const again = beginDurableLaunchGuard({
      mutex,
      hasOpenAttempt: () => undefined
    });
    expect(again.ok).toBe(true);
    if (again.ok) {
      again.release();
    }
  });

  it("fails closed when an open attempt appears before claim", () => {
    const mutex = createDurableLaunchMutex();
    const guard = beginDurableLaunchGuard({
      mutex,
      hasOpenAttempt: () => ({ attemptId: "existing" })
    });
    expect(guard.ok).toBe(false);
    if (guard.ok) {
      return;
    }
    expect(guard.reason).toBe("open_attempt_exists");
    expect(guard.openAttemptId).toBe("existing");
    expect(mutex.current).toBe(false);
  });
});
