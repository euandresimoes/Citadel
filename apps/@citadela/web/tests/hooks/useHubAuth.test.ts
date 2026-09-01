import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHubAuth } from "../../src/hooks/@citadela/auth/useHubAuth";

describe("useHubAuth", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads setup status and session together", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("setup/status")) return new Response(JSON.stringify({ configured: true }), { status: 200 });
      return new Response(JSON.stringify({ actorId: "local-profile" }), { status: 200 });
    });
    const { result } = renderHook(() => useHubAuth());

    await waitFor(() => expect(result.current.setupLoading).toBe(false));
    expect(result.current.setup?.configured).toBe(true);
    expect(result.current.session?.actorId).toBe("local-profile");
  });

  it("exposes an unconfigured setup state", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("setup/status")) return new Response(JSON.stringify({ configured: false }), { status: 200 });
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    });
    const { result } = renderHook(() => useHubAuth());

    await waitFor(() => expect(result.current.setup?.configured).toBe(false));
    expect(result.current.session).toBeNull();
  });
});
