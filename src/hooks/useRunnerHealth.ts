import { useCallback, useEffect, useRef, useState } from "react";

import {
  checkJobScoutRunnerHealth,
  requestJobScoutRunnerStart
} from "../core/jobScoutRunnerClient";

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

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (sessionRunnerOk !== null && now - sessionCheckedAt < HEALTH_TTL_MS) {
      const cached = { ok: sessionRunnerOk, message: sessionRunnerOk ? "Runner awake on 127.0.0.1:8122." : "Local Job Scout Runner is not running." };
      if (mountedRef.current) {
        setStatus(cached);
        setChecking(false);
      }
      return cached;
    }

    setChecking(true);
    const result = await checkJobScoutRunnerHealth();
    sessionRunnerOk = result.ok;
    sessionCheckedAt = Date.now();
    if (mountedRef.current) {
      setStatus(result);
      setChecking(false);
    }
    return result;
  }, []);

  const startRunner = useCallback(async () => {
    setStarting(true);
    const start = await requestJobScoutRunnerStart();
    if (!start.ok) {
      setStarting(false);
      return { ok: false, message: start.message };
    }
    sessionCheckedAt = 0;
    const health = await refresh();
    setStarting(false);
    return { ok: health.ok, message: health.ok ? start.message : health.message };
  }, [refresh]);

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
}
