import { useCallback, useEffect, useRef, useState } from "react";
import { hubApi, type PairingRequest } from "../../../services/@citadela/hub/hubApi";

export function usePairingRequests() {
  const [requests, setRequests] = useState<PairingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      setRequests(await hubApi.listPairingRequests());
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Unable to load pairing requests"));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadHandle = window.setTimeout(() => void refresh(), 0);
    const pollHandle = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(loadHandle);
      window.clearInterval(pollHandle);
    };
  }, [refresh]);

  const act = useCallback(async (requestId: string, action: "approve" | "reject") => {
    setActingRequestId(requestId);
    setError(null);
    try {
      if (action === "approve") await hubApi.approvePairing(requestId);
      else await hubApi.rejectPairing(requestId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Unable to update pairing request"));
    } finally {
      setActingRequestId(null);
    }
  }, [refresh]);

  return { requests, loading, error, actingRequestId, refresh, approve: (requestId: string) => act(requestId, "approve"), reject: (requestId: string) => act(requestId, "reject") };
}
