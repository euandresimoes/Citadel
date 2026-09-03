import { useCallback, useEffect, useState } from "react";
import { hubApi, type HubSetupStatus } from "../../../services/@citadela/hub/hubApi";
import { useHubSession } from "./useHubSession";

export function useHubAuth() {
  const sessionState = useHubSession();
  const { refresh: refreshSession } = sessionState;
  const [setup, setSetup] = useState<HubSetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState<Error | null>(null);

  const refreshSetup = useCallback(async () => {
    setSetupLoading(true);
    setSetupError(null);
    try {
      setSetup(await hubApi.getSetupStatus());
    } catch (cause) {
      setSetupError(cause instanceof Error ? cause : new Error("Unable to read Hub setup status"));
    } finally {
      setSetupLoading(false);
    }
  }, []);

  const createProfile = useCallback(async (password: string, displayName?: string, avatarBase64?: string) => {
    await hubApi.createProfile({ password, ...(displayName ? { displayName } : {}), ...(avatarBase64 ? { avatarBase64 } : {}) });
  }, []);

  const completeSetup = useCallback(async () => {
    await refreshSetup();
    await refreshSession();
  }, [refreshSetup, refreshSession]);

  const login = useCallback(async (method: "password" | "otp", credential: string) => {
    await hubApi.login(method, credential);
    await refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const handle = window.setTimeout(() => void refreshSetup(), 0);
    return () => window.clearTimeout(handle);
  }, [refreshSetup]);

  return {
    ...sessionState,
    setup,
    setupLoading,
    setupError,
    createProfile,
    completeSetup,
    login,
  };
}
