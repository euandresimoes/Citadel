import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";

describe("App authentication gate", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows setup when the Hub has no profile", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("setup/status")) return new Response(JSON.stringify({ configured: false }), { status: 200 });
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Create your Citadela profile" })).toBeInTheDocument());
  });

  it("shows login when the profile exists without a session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("setup/status")) return new Response(JSON.stringify({ configured: true }), { status: 200 });
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Sign in to Citadela" })).toBeInTheDocument());
  });

  it("shows the Shell for an authenticated session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ actorId: "local-profile" }), { status: 200 }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument());
  });
});
