import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeviceActionsPanel from "../../src/components/@citadela/composed/devices/DeviceActionsPanel";

afterEach(() => cleanup());

describe("DeviceActionsPanel", () => {
  it("requires confirmation before dispatching a power command", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { commands: [] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "command-1", deviceId: "device-1", type: "device.system.power.restart", state: "awaiting_confirmation", createdAt: "", expiresAt: "", confirmedAt: null, completedAt: null, error: null }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "command-1", deviceId: "device-1", type: "device.system.power.restart", state: "dispatched", createdAt: "", expiresAt: "", confirmedAt: "", completedAt: null, error: null }), { status: 200 }));
    render(<DeviceActionsPanel deviceId="device-1" online />);
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    const dialog = await screen.findByRole("dialog", { name: "Restart device?" });
    expect(dialog).toHaveTextContent("temporarily unavailable");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restart", exact: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/commands");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/v1/commands/command-1/confirm");
  });

  it("does not expose power actions while offline", () => {
    render(<DeviceActionsPanel deviceId="device-1" online={false} />);
    expect(screen.getByText("Actions are unavailable while the device is offline.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restart" })).not.toBeInTheDocument();
  });
});
