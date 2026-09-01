import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useCurrentRoute } from "../../src/hooks/@citadela/routing/useCurrentRoute";
import { ViewportComposable } from "../../src/composables/@citadela/Shell/ViewportComposable";

describe("useCurrentRoute", () => {
  beforeEach(() => window.history.replaceState({}, "", "/dashboard"));

  it("updates when navigation changes", () => {
    const { result } = renderHook(() => useCurrentRoute());
    expect(result.current).toBe("/dashboard");

    act(() => ViewportComposable.changeView("/devices"));

    expect(result.current).toBe("/devices");
  });
});
