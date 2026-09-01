import DashboardView from "../../../../../views/@citadela/DashboardView/DashboardView";
import DevicesView from "../../../../../views/@citadela/DevicesView/DevicesView";
import ViewportHeader from "./Header/ViewportHeader";
import { useCurrentRoute } from "../../../../../hooks/@citadela/routing/useCurrentRoute";
import "./Viewport.scss";

function ViewportContent() {
  const currentRoute = useCurrentRoute();

  if (currentRoute === "/" || currentRoute === "/dashboard") return <DashboardView />;
  if (currentRoute === "/devices") return <DevicesView />;
  return <DashboardView />;
}

function Viewport() {
  return <section className="app-viewport" aria-label="Application content">
    <ViewportHeader />
    <ViewportContent />
  </section>;
}

export default Viewport;
