import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DevicesView from "../../src/views/@citadela/DevicesView/DevicesView";

describe("DevicesView", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows the empty state when no devices are connected", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => Promise.resolve(new Response(JSON.stringify(String(input).includes("pairing/requests") ? [] : { data: { devices: [] } }), { status: 200 })));
    render(<DevicesView />);
    await waitFor(() => expect(screen.getByText("No devices yet")).toBeInTheDocument());
  });

  it("shows connected devices from the Hub read model", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { devices: [{ id: "laptop", status: "online", networkMode: "lan", connectionId: "connection-1", connectedAt: "2026-01-01", lastHeartbeat: "2026-01-01" }] } }), { status: 200 }));
    render(<DevicesView />);
    await waitFor(() => expect(screen.getByText("laptop")).toBeInTheDocument());
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });
});
