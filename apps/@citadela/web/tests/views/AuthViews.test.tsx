import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginView from "../../src/views/@citadela/auth/LoginView/LoginView";
import SetupView from "../../src/views/@citadela/auth/SetupView/SetupView";

describe("authentication views", () => {
  it("submits profile setup data", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ otpauthUri: "otpauth://totp/Citadela:Owner", qrCodeDataUrl: "data:image/png;base64,ZmFrZQ==" }), { status: 200 }));
    render(<SetupView onSubmit={onSubmit} onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Owner" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-very-strong-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "a-very-strong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Enable two-step verification" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("a-very-strong-password", "Owner", undefined));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("switches between password and OTP login", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginView onLogin={onLogin} />);
    fireEvent.click(screen.getByRole("button", { name: "OTP" }));
    screen.getAllByLabelText(/Authentication code \d/).forEach((input, index) => fireEvent.change(input, { target: { value: String(index + 1) } }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith("otp", "123456"));
  });
});
