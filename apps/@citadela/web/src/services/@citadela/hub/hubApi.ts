export interface HubSession {
  actorId: string;
}

export interface HubApiError {
  error: string;
}

export interface HubSetupStatus {
  configured: boolean;
}

export interface HubProfile { id: string; displayName: string; avatarBase64: string | null; totpEnabled: boolean; }
export interface TotpEnrollment { otpauthUri: string; qrCodeDataUrl: string; }

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

export type DevicePowerAction = "device.system.power.sleep" | "device.system.power.restart" | "device.system.power.shutdown";
export interface CommandRecord { id: string; deviceId: string; type: string; state: string; createdAt: string; expiresAt: string; confirmedAt: string | null; completedAt: string | null; error: string | null; }

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
  getProfile: (): Promise<HubProfile> => request<HubProfile>("/api/v1/auth/profile"),
  updateProfile: (input: { displayName?: string; avatarBase64?: string | null }): Promise<HubProfile> => request<HubProfile>("/api/v1/auth/profile", { method: "PATCH", headers: csrfHeaders(), body: JSON.stringify(input) }),
  changePassword: (currentPassword: string, newPassword: string): Promise<void> => request<void>("/api/v1/auth/password", { method: "POST", headers: csrfHeaders(), body: JSON.stringify({ currentPassword, newPassword }) }),
  beginTotpEnrollment: (): Promise<TotpEnrollment> => request<TotpEnrollment>("/api/v1/auth/totp/enroll", { method: "POST", headers: csrfHeaders() }),
  confirmTotpEnrollment: (token: string): Promise<{ recoveryCodes: string[] }> => request<{ recoveryCodes: string[] }>("/api/v1/auth/totp/confirm", { method: "POST", headers: csrfHeaders(), body: JSON.stringify({ token }) }),
  disableTotp: (password: string): Promise<void> => request<void>("/api/v1/auth/totp/disable", { method: "POST", headers: csrfHeaders(), body: JSON.stringify({ password }) }),
  login: (method: "password" | "otp", credential: string): Promise<void> => request<void>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ method, credential }),
  }),
  logout: (): Promise<void> => request<void>("/api/v1/auth/logout", {
    method: "POST",
    headers: csrfHeaders(),
  }),
  listPairingRequests: (): Promise<PairingRequest[]> => request<PairingRequest[]>("/api/v1/pairing/requests"),
  approvePairing: (requestId: string): Promise<void> => pairingAction(requestId, "approve"),
  rejectPairing: (requestId: string): Promise<void> => pairingAction(requestId, "reject"),
  createCommand: (deviceId: string, type: DevicePowerAction): Promise<CommandRecord> => request<CommandRecord>("/api/v1/commands", {
    method: "POST", headers: csrfHeaders(), body: JSON.stringify({ deviceId, type }),
  }),
  confirmCommand: (commandId: string): Promise<CommandRecord> => request<CommandRecord>(`/api/v1/commands/${encodeURIComponent(commandId)}/confirm`, {
    method: "POST", headers: csrfHeaders(),
  }),
  getCommand: (commandId: string): Promise<CommandRecord> => request<CommandRecord>(`/api/v1/commands/${encodeURIComponent(commandId)}`),
};

function pairingAction(requestId: string, action: "approve" | "reject"): Promise<void> {
  return request<void>(`/api/v1/pairing/requests/${encodeURIComponent(requestId)}/${action}`, {
    method: "POST",
    headers: csrfHeaders(),
  });
}

function csrfHeaders(): Record<string, string> { return { "x-citadela-csrf": readCookie("citadela_csrf") ?? "" }; }

function readCookie(name: string): string | undefined {
  const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1);
}
