import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDevices } from "../../src/hooks/@citadela/devices/useDevices";

describe("useDevices", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads the devices read model from GraphQL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { devices: [{ id: "device-1", networkMode: "lan", connectionId: "connection-1", connectedAt: "2026-01-01", lastHeartbeat: "2026-01-01" }] } }), { status: 200 }));
    const { result } = renderHook(() => useDevices());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.devices[0]?.id).toBe("device-1");
    expect(result.current.error).toBeNull();
  });

  it("exposes GraphQL failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: "Unauthorized" }] }), { status: 200 }));
    const { result } = renderHook(() => useDevices());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe("Unauthorized");
  });
});
