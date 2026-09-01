import { useCallback } from "react";
import { ViewportComposable } from "../../../composables/@citadela/Shell/ViewportComposable";

export function useNavigation() {
  const navigate = useCallback((route: string) => {
    ViewportComposable.changeView(route);
  }, []);

  return { navigate };
}
