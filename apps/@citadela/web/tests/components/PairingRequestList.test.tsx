import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PairingRequestList from "../../src/components/@citadela/composed/devices/PairingRequestList";

const request = {
  requestId: "request-1",
  deviceId: "raspberry-pi",
  identity: { algorithm: "ed25519", publicKey: "public-key", fingerprint: "fingerprint-1" },
  createdAt: "2026-09-01T12:00:00.000Z",
};

describe("PairingRequestList", () => {
  it("shows an empty state", () => {
    render(<PairingRequestList requests={[]} actingRequestId={null} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText("No pending pairing requests.")).toBeInTheDocument();
  });

  it("emits approval and rejection actions for a request", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(<PairingRequestList requests={[request]} actingRequestId={null} onApprove={onApprove} onReject={onReject} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onApprove).toHaveBeenCalledWith("request-1");
    expect(onReject).toHaveBeenCalledWith("request-1");
  });
});
