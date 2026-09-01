export interface HubSession {
  actorId: string;
}

export interface HubApiError {
  error: string;
}

export interface HubSetupStatus {
  configured: boolean;
}

export interface PairingRequest {
  requestId: string;
  deviceId: string;
  identity: {
    algorithm: string;
    publicKey: string;
    fingerprint: string;
  };
  createdAt: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Hub request failed with status ${response.status}`;
    try {
      const body = await response.json() as HubApiError;
      if (typeof body.error === "string") message = body.error;
    } catch {
      // Keep the HTTP status message when the response has no JSON body.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const hubApi = {
  getSetupStatus: (): Promise<HubSetupStatus> => request<HubSetupStatus>("/api/v1/setup/status"),
  createProfile: (input: { password: string; displayName?: string }): Promise<void> => request<void>("/api/v1/setup/profile", {
    method: "POST",
    body: JSON.stringify(input),
  }),
  getSession: (): Promise<HubSession> => request<HubSession>("/api/v1/auth/session"),
  login: (method: "password" | "otp", credential: string): Promise<void> => request<void>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ method, credential }),
  }),
  logout: (): Promise<void> => request<void>("/api/v1/auth/logout", {
    method: "POST",
    headers: { "x-citadela-csrf": readCookie("citadela_csrf") ?? "" },
  }),
  listPairingRequests: (): Promise<PairingRequest[]> => request<PairingRequest[]>("/api/v1/pairing/requests"),
  approvePairing: (requestId: string): Promise<void> => pairingAction(requestId, "approve"),
  rejectPairing: (requestId: string): Promise<void> => pairingAction(requestId, "reject"),
};

function pairingAction(requestId: string, action: "approve" | "reject"): Promise<void> {
  return request<void>(`/api/v1/pairing/requests/${encodeURIComponent(requestId)}/${action}`, {
    method: "POST",
    headers: { "x-citadela-csrf": readCookie("citadela_csrf") ?? "" },
  });
}

function readCookie(name: string): string | undefined {
  const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1);
}
