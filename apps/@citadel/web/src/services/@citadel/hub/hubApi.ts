export interface HubSession {
  actorId: string;
}

export interface HubApiError {
  error: string;
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
  getSession: (): Promise<HubSession> => request<HubSession>("/api/v1/auth/session"),
  login: (method: "password" | "otp", credential: string): Promise<void> => request<void>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ method, credential }),
  }),
  logout: (): Promise<void> => request<void>("/api/v1/auth/logout", {
    method: "POST",
    headers: { "x-citadel-csrf": readCookie("citadel_csrf") ?? "" },
  }),
};

function readCookie(name: string): string | undefined {
  const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1);
}
