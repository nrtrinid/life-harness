/**
 * Synchronous mutex for durable launch_implementation UI triggers.
 * React state (isTriggering*) is not a concurrency primitive.
 */
export type DurableLaunchMutex = {
  current: boolean;
};

export function createDurableLaunchMutex(): DurableLaunchMutex {
  return { current: false };
}

export type BeginDurableLaunchGuardResult =
  | { ok: true; release: () => void }
  | { ok: false; reason: "mutex_held" | "open_attempt_exists"; openAttemptId?: string };

/**
 * Try to enter the durable launch critical section.
 * Call before creating an attemptId / claim / POST.
 * Always call release() from finally when ok.
 */
export function beginDurableLaunchGuard(input: {
  mutex: DurableLaunchMutex;
  hasOpenAttempt: () => { attemptId: string } | undefined;
}): BeginDurableLaunchGuardResult {
  if (input.mutex.current) {
    return { ok: false, reason: "mutex_held" };
  }
  input.mutex.current = true;
  const open = input.hasOpenAttempt();
  if (open) {
    input.mutex.current = false;
    return { ok: false, reason: "open_attempt_exists", openAttemptId: open.attemptId };
  }
  return {
    ok: true,
    release: () => {
      input.mutex.current = false;
    }
  };
}
