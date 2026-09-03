import type { Device } from "../../../../hooks/@citadela/devices/useDevices";
import { useNavigation } from "../../../../hooks/@citadela/routing/useNavigation";

interface DeviceListItemProps {
  device: Device;
}

function DeviceListItem({ device }: DeviceListItemProps) {
  const { navigate } = useNavigation();
  return <article className="flex min-h-16 items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 transition-colors hover:bg-white/[0.06]">
    <div className="flex min-w-0 flex-col gap-1">
      <h3><button className="truncate text-left text-sm font-medium text-primary hover:text-accent" type="button" onClick={() => navigate(`/devices/${encodeURIComponent(device.id)}`)}>{device.id}</button></h3>
      <span className="text-xs text-muted">{device.networkMode}</span>
    </div>
    <span className={`text-xs ${device.status === "online" ? "text-emerald-400" : "text-muted"}`}>{device.status === "online" ? "Connected" : "Offline"}</span>
  </article>;
}

export default DeviceListItem;
