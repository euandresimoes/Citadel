import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewportComposable } from "../../src/composables/@citadela/Shell/ViewportComposable";

describe("ViewportComposable", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/dashboard");
  });

  it("changes internal routes without reloading", () => {
    const listener = vi.fn();
    const unsubscribe = ViewportComposable.subscribe(listener);

    ViewportComposable.changeView("/devices");

    expect(ViewportComposable.getCurrentRoute()).toBe("/devices");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("rejects external routes", () => {
    expect(() => ViewportComposable.changeView("https://example.com")).toThrow("internal paths");
    expect(() => ViewportComposable.changeView("//example.com")).toThrow("internal paths");
  });

  it("replaces the root route without adding browser history", () => {
    window.history.replaceState({}, "", "/");
    const listener = vi.fn();
    const unsubscribe = ViewportComposable.subscribe(listener);

    ViewportComposable.replaceView("/dashboard");

    expect(ViewportComposable.getCurrentRoute()).toBe("/dashboard");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
