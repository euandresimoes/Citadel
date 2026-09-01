import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHubSession } from "../../src/hooks/@citadela/auth/useHubSession";

describe("useHubSession", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads the authenticated session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ actorId: "local-profile" }), { status: 200 }));
    const { result } = renderHook(() => useHubSession());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual({ actorId: "local-profile" });
    expect(result.current.error).toBeNull();
  });

  it("represents an unauthenticated response without crashing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));
    const { result } = renderHook(() => useHubSession());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.error?.message).toBe("Unauthorized");
  });

  it("clears the session on logout", async () => {
    Object.defineProperty(document, "cookie", { configurable: true, value: "citadela_csrf=csrf-token" });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ actorId: "local-profile" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { result } = renderHook(() => useHubSession());
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => result.current.logout());

    expect(result.current.session).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
