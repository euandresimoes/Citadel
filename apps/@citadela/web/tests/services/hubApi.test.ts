import { beforeEach, describe, expect, it, vi } from "vitest";
import { hubApi } from "../../src/services/@citadela/hub/hubApi";

describe("hubApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, "cookie", { configurable: true, value: "citadela_csrf=csrf-token" });
  });

  it("sends credentials and parses successful requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ configured: false }), { status: 200 }));

    await expect(hubApi.getSetupStatus()).resolves.toEqual({ configured: false });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/setup/status", expect.objectContaining({ credentials: "include" }));
  });

  it("uses the CSRF cookie for logout", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await hubApi.logout();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/logout", expect.objectContaining({ headers: expect.objectContaining({ "x-citadela-csrf": "csrf-token" }) }));
  });

  it("converts API errors into useful Error objects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    await expect(hubApi.getSession()).rejects.toThrow("Unauthorized");
  });

  it("lists and updates pairing requests with CSRF protection", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await hubApi.listPairingRequests();
    await hubApi.approvePairing("request/1");
    await hubApi.rejectPairing("request/1");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/pairing/requests", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/pairing/requests/request%2F1/approve", expect.objectContaining({ headers: expect.objectContaining({ "x-citadela-csrf": "csrf-token" }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/pairing/requests/request%2F1/reject", expect.objectContaining({ headers: expect.objectContaining({ "x-citadela-csrf": "csrf-token" }) }));
  });
});
