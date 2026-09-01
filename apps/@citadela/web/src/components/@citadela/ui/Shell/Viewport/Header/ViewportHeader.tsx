import { useCurrentRoute } from "../../../../../../hooks/@citadela/routing/useCurrentRoute";
import "./ViewportHeader.scss";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  devices: "Devices",
  terminal: "Terminal",
};

function getSegmentLabel(segment: string): string {
  const normalizedSegment = decodeURIComponent(segment).toLowerCase();
  return routeLabels[normalizedSegment] ?? decodeURIComponent(segment)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function ViewportHeader() {
  const currentRoute = useCurrentRoute();
  const segments = currentRoute.split("/").filter(Boolean);
  const breadcrumbs = segments.length > 0 ? segments.map(getSegmentLabel) : ["Dashboard"];
  const currentLabel = breadcrumbs[breadcrumbs.length - 1] ?? "Dashboard";

  return <header className="viewport-header">
    <div className="viewport-header__title-row">
      <h1 className="viewport-header__title">{currentLabel}</h1>
    </div>
    <nav className="viewport-header__breadcrumbs" aria-label="Breadcrumb">
      {breadcrumbs.map((breadcrumb, index) => <span className="viewport-header__breadcrumb" key={`${breadcrumb}-${index}`}>
        {index > 0 ? <span className="viewport-header__separator" aria-hidden="true">›</span> : null}
        <span aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}>{breadcrumb}</span>
      </span>)}
    </nav>
  </header>;
}

export default ViewportHeader;
