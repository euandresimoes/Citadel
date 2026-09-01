import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import SidebarNav from "../../src/components/@citadela/ui/Shell/Sidebar/Nav/SidebarNav";

describe("SidebarNav", () => {
  beforeEach(() => window.history.replaceState({}, "", "/dashboard"));

  it("renders supported navigation and changes the active route", () => {
    render(<SidebarNav />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.queryByText("Files")).not.toBeInTheDocument();
    expect(screen.queryByText("Containers")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Devices"));

    expect(window.location.pathname).toBe("/devices");
    expect(screen.getByText("Devices").closest("li")).toHaveClass("active");
  });
});
