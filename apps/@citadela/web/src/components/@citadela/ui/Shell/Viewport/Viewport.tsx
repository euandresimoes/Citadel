import DashboardView from "../../../../../views/@citadela/DashboardView/DashboardView";
import DevicesView from "../../../../../views/@citadela/DevicesView/DevicesView";
import DeviceDetailView from "../../../../../views/@citadela/DeviceDetailView/DeviceDetailView";
import ProfileSettingsView from "../../../../../views/@citadela/ProfileSettingsView/ProfileSettingsView";
import NetworkSettingsView from "../../../../../views/@citadela/NetworkSettingsView/NetworkSettingsView";
import ViewportHeader from "./Header/ViewportHeader";
import { useCurrentRoute } from "../../../../../hooks/@citadela/routing/useCurrentRoute";
import "./Viewport.scss";

function ViewportContent() {
  const currentRoute = useCurrentRoute();

  if (currentRoute === "/" || currentRoute === "/dashboard") return <DashboardView />;
  if (currentRoute === "/devices") return <DevicesView />;
  if (currentRoute.startsWith("/devices/")) return <DeviceDetailView deviceId={decodeURIComponent(currentRoute.slice("/devices/".length))} />;
  if (currentRoute === "/settings/profile") return <ProfileSettingsView />;
  if (currentRoute === "/settings/network") return <NetworkSettingsView />;
  return <DashboardView />;
}

function Viewport() {
  return <section className="app-viewport" aria-label="Application content">
    <ViewportHeader />
    <ViewportContent />
  </section>;
}

export default Viewport;
