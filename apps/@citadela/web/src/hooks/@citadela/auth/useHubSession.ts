import { useCallback, useEffect, useState } from "react";
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSession(await hubApi.getSession());
    } catch (cause) {
      setSession(null);
      setError(cause instanceof Error ? cause : new Error("Unable to read Hub session"));
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await hubApi.logout();
    setSession(null);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [refresh]);

  return { session, loading, error, refresh, logout };
}
