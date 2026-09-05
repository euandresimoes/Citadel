import { useCallback, useEffect, useRef, useState } from "react";
import { hubApi, type HubSession } from "../../../services/@citadela/hub/hubApi";

interface HubSessionState {
  session: HubSession | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useHubSession(): HubSessionState {
  const [session, setSession] = useState<HubSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const nextSession = await hubApi.getSession();
      if (mountedRef.current) setSession(nextSession);
    } catch (cause) {
      if (mountedRef.current) {
        setSession(null);
        setError(cause instanceof Error ? cause : new Error("Unable to read Hub session"));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await hubApi.logout();
    setSession(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const handle = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => { mountedRef.current = false; window.clearTimeout(handle); };
  }, [refresh]);

  return { session, loading, error, refresh, logout };
}
