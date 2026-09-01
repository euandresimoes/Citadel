import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginView from "../../src/views/@citadela/auth/LoginView/LoginView";
import SetupView from "../../src/views/@citadela/auth/SetupView/SetupView";

describe("authentication views", () => {
  it("submits profile setup data", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SetupView onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Owner" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-very-strong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("a-very-strong-password", "Owner"));
  });

  it("switches between password and OTP login", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginView onLogin={onLogin} />);
    fireEvent.click(screen.getByRole("button", { name: "OTP" }));
    fireEvent.change(screen.getByLabelText("Authentication code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith("otp", "123456"));
  });
});
