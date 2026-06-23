import { useCallback, useEffect, useRef, useState } from "react";

import {
  lifeHarnessApi,
  lifeHarnessNetworkStore,
  useLazyCheckJobScoutRunnerHealthQuery,
  useStartJobScoutRunnerMutation
} from "../network";

const HEALTH_TTL_MS = 30_000;

let sessionRunnerOk: boolean | null = null;
let sessionCheckedAt = 0;

export interface RunnerHealthState {
  ok: boolean;
  message: string;
  checking: boolean;
  refresh: () => Promise<{ ok: boolean; message: string }>;
  startRunner: () => Promise<{ ok: boolean; message: string }>;
}

export function useRunnerHealth(): RunnerHealthState {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const mountedRef = useRef(true);
  const [triggerHealthCheck] = useLazyCheckJobScoutRunnerHealthQuery();
  const [startJobScoutRunner] = useStartJobScoutRunnerMutation();

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (sessionRunnerOk !== null && now - sessionCheckedAt < HEALTH_TTL_MS) {
      const cached = {
        ok: sessionRunnerOk,
        message: sessionRunnerOk
          ? "Runner awake on 127.0.0.1:8122."
          : "Local Job Scout Runner is not running."
      };
      if (mountedRef.current) {
        setStatus(cached);
        setChecking(false);
      }
      return cached;
    }

    setChecking(true);
    try {
      const result = await triggerHealthCheck(undefined, true).unwrap();
      sessionRunnerOk = result.ok;
      sessionCheckedAt = Date.now();
      if (mountedRef.current) {
        setStatus(result);
        setChecking(false);
      }
      return result;
    } catch {
      const failed = { ok: false, message: "Local Job Scout Runner is not running." };
      sessionRunnerOk = false;
      sessionCheckedAt = Date.now();
      if (mountedRef.current) {
        setStatus(failed);
        setChecking(false);
      }
      return failed;
    }
  }, [triggerHealthCheck]);

  const startRunner = useCallback(async () => {
    setStarting(true);
    try {
      const start = await startJobScoutRunner().unwrap();
      if (!start.ok) {
        return { ok: false, message: start.message };
      }
      sessionCheckedAt = 0;
      const health = await refresh();
      return { ok: health.ok, message: health.ok ? start.message : health.message };
    } catch {
      return { ok: false, message: "Could not start Job Scout Runner." };
    } finally {
      setStarting(false);
    }
  }, [refresh, startJobScoutRunner]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return {
    ok: status?.ok ?? false,
    message: status?.message ?? "Checking Job Scout Runner…",
    checking: checking || starting,
    refresh,
    startRunner
  };
}

export function invalidateRunnerHealthCache(): void {
  sessionRunnerOk = null;
  sessionCheckedAt = 0;
  lifeHarnessNetworkStore.dispatch(lifeHarnessApi.util.invalidateTags(["JobScoutRunner"]));
}
