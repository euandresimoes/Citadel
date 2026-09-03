import { useEffect, useState } from "react";
import { HiOutlinePlus } from "react-icons/hi";
import ButtonAccent from "../../../base/buttons/ButtonAccent";
import AddDeviceModal from "../../../composed/devices/AddDeviceModal";
import DashboardView from "../../../../../views/@citadela/DashboardView/DashboardView";
import DevicesView from "../../../../../views/@citadela/DevicesView/DevicesView";
import DeviceDetailView from "../../../../../views/@citadela/DeviceDetailView/DeviceDetailView";
import ProfileSettingsView from "../../../../../views/@citadela/ProfileSettingsView/ProfileSettingsView";
import NetworkSettingsView from "../../../../../views/@citadela/NetworkSettingsView/NetworkSettingsView";
import ViewportHeader from "./Header/ViewportHeader";
import { useCurrentRoute } from "../../../../../hooks/@citadela/routing/useCurrentRoute";
import { ViewportComposable } from "../../../../../composables/@citadela/Shell/ViewportComposable";

function ViewportContent() {
  const currentRoute = useCurrentRoute();

  if (currentRoute === "/" || currentRoute === "/dashboard")
    return <DashboardView />;
  if (currentRoute === "/devices") return <DevicesView />;
  if (currentRoute.startsWith("/devices/"))
    return (
      <DeviceDetailView
        deviceId={decodeURIComponent(currentRoute.slice("/devices/".length))}
      />
    );
  if (currentRoute === "/settings/profile") return <ProfileSettingsView />;
  if (currentRoute === "/settings/network") return <NetworkSettingsView />;
  return <DashboardView />;
}

function Viewport() {
  const currentRoute = useCurrentRoute();
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);

  useEffect(() => {
    if (currentRoute === "/") ViewportComposable.replaceView("/dashboard");
  }, [currentRoute]);

  return (
    <section
      className="flex h-full w-[45rem] pt-8 flex-col justify-start overflow-hidden p-0"
      aria-label="Application content"
    >
      <ViewportHeader>
        {currentRoute === "/devices" ? (
          <ButtonAccent
            icon={<HiOutlinePlus aria-hidden="true" />}
            iconPosition="left"
            onClick={() => setAddDeviceOpen(true)}
          >
            Add device
          </ButtonAccent>
        ) : null}
      </ViewportHeader>
      <main className="min-h-0 flex-1 overflow-auto pb-6 pr-6" aria-label="Route content">
        <ViewportContent />
      </main>
      <AddDeviceModal open={addDeviceOpen} onClose={() => setAddDeviceOpen(false)} />
    </section>
  );
}

export default Viewport;
