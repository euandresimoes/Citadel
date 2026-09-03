import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import InputOtp from "../../src/components/@citadela/composed/inputs/InputOtp";
import InputPassword from "../../src/components/@citadela/composed/inputs/InputPassword";

describe("authentication inputs", () => {
  it("configures password input semantics", () => {
    render(<InputPassword label="Password" name="password" required />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Password")).toBeRequired();
  });

  it("configures OTP input semantics", () => {
    render(<InputOtp label="Authentication code" name="otp" required />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(6);
    expect(inputs[0]).toHaveAttribute("inputmode", "numeric");
    expect(inputs[0]).toHaveAttribute("autocomplete", "one-time-code");
    expect(inputs[0]).toHaveAttribute("maxlength", "1");
  });
});
