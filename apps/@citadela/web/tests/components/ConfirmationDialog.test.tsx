import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfirmationDialog from "../../src/components/@citadela/composed/dialogs/ConfirmationDialog";

describe("ConfirmationDialog", () => {
  afterEach(() => cleanup());
  it("exposes an accessible dialog and closes with Escape", () => {
    const onCancel = vi.fn();
    render(<ConfirmationDialog open title="Restart device" message="The device will restart." onConfirm={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole("dialog", { name: "Restart device" })).toHaveAccessibleDescription("The device will restart.");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("locks actions while confirming and reports failures", async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = render(<ConfirmationDialog open title="Shutdown" message="Confirm shutdown." onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled());
    first.unmount();

    const failing = vi.fn(async () => { throw new Error("Action failed"); });
    render(<ConfirmationDialog open title="Retry" message="Retry action." onConfirm={failing} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Action failed"));
  });
});
