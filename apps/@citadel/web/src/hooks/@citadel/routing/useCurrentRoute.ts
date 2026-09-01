import { useSyncExternalStore } from "react";
import { ViewportComposable } from "../../../composables/@citadel/Shell/ViewportComposable";

export function useCurrentRoute(): string {
  return useSyncExternalStore(
    ViewportComposable.subscribe,
    ViewportComposable.getCurrentRoute,
  );
}
