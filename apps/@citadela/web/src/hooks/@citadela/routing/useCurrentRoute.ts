import { useSyncExternalStore } from "react";
import { ViewportComposable } from "../../../composables/@citadela/Shell/ViewportComposable";

export function useCurrentRoute(): string {
  return useSyncExternalStore(
    ViewportComposable.subscribe,
    ViewportComposable.getCurrentRoute,
  );
}
