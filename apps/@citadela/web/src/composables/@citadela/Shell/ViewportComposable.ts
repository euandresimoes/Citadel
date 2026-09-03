type RouteListener = () => void;

const listeners = new Set<RouteListener>();

function normalizeRoute(route: string): string {
  const normalized = route.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    throw new Error("Viewport routes must be internal paths");
  }
  return normalized || "/";
}

function notifyRouteChange(): void {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", notifyRouteChange);
}

export const ViewportComposable = {
  changeView: (route: string): void => {
    const nextRoute = normalizeRoute(route);
    navigate(nextRoute, false);
  },
  replaceView: (route: string): void => {
    const nextRoute = normalizeRoute(route);
    navigate(nextRoute, true);
  },
  getCurrentRoute: (): string => (typeof window === "undefined" ? "/" : window.location.pathname || "/"),
  subscribe: (listener: RouteListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function navigate(route: string, replace: boolean): void {
  if (typeof window === "undefined" || window.location.pathname === route) return;
  if (replace) window.history.replaceState({}, "", route);
  else window.history.pushState({}, "", route);
  notifyRouteChange();
}
