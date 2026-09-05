import type { Device } from "../../../../hooks/@citadela/devices/useDevices";
import { useNavigation } from "../../../../hooks/@citadela/routing/useNavigation";

interface DeviceListItemProps {
  device: Device;
}

function DeviceListItem({ device }: DeviceListItemProps) {
  const { navigate } = useNavigation();
  return <article className="flex min-h-16 items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 transition-colors hover:bg-white/[0.06]">
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="flex min-w-0 items-center gap-2"><button className="truncate text-left text-sm font-medium text-primary hover:text-accent" type="button" onClick={() => navigate(`/devices/${encodeURIComponent(device.id)}`)}>{device.id}</button>{device.hostRole === "hub-host" ? <span className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">Hub host</span> : null}</h3>
      <span className="text-xs text-muted">{device.networkMode}</span>
    </div>
    <span className={`text-xs ${device.status === "online" ? "text-emerald-400" : "text-muted"}`}>{device.status === "online" ? "Connected" : "Offline"}</span>
  </article>;
}

export default DeviceListItem;
