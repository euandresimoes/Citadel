import { useCurrentRoute } from "../../../../../../hooks/@citadela/routing/useCurrentRoute";
import type { ReactNode } from "react";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  devices: "Devices",
  terminal: "Terminal",
};

const routeDescriptions: Record<string, string> = {
  dashboard: "A quick overview of your Citadela Hub.",
  devices: "Manage and monitor your connected devices.",
  terminal: "Run commands and inspect the device terminal.",
};

function getSegmentLabel(segment: string): string {
  const normalizedSegment = decodeURIComponent(segment).toLowerCase();
  return routeLabels[normalizedSegment] ?? decodeURIComponent(segment)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

interface ViewportHeaderProps { children?: ReactNode; }

function ViewportHeader({ children }: ViewportHeaderProps) {
  const currentRoute = useCurrentRoute();
  const segments = currentRoute.split("/").filter(Boolean);
  const breadcrumbs = segments.length > 0 ? segments.map(getSegmentLabel) : ["Dashboard"];
  const currentLabel = breadcrumbs[breadcrumbs.length - 1] ?? "Dashboard";
  const description = routeDescriptions[segments[0]?.toLowerCase() ?? "dashboard"] ?? "Manage your Citadela Hub workspace.";

  return <header className="mb-8 flex items-start justify-between gap-2 pr-6">
    <div className="flex min-w-0 flex-col gap-0.5">
      <h1 className="font-heading text-2xl font-semibold leading-tight text-primary">{currentLabel}</h1>
      <p className="text-[13px] text-muted">{description}</p>
    </div>
    {children ? <div className="flex items-center justify-end gap-2">{children}</div> : null}
  </header>;
}

export default ViewportHeader;
