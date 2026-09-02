import type { Device } from "../../../../hooks/@citadela/devices/useDevices";
import "./DeviceListItem.scss";
import { useNavigation } from "../../../../hooks/@citadela/routing/useNavigation";

interface DeviceListItemProps {
  device: Device;
}

function DeviceListItem({ device }: DeviceListItemProps) {
  const { navigate } = useNavigation();
  return <article className="device-list-item">
    <div className="device-list-item__identity">
      <h3><button type="button" onClick={() => navigate(`/devices/${encodeURIComponent(device.id)}`)}>{device.id}</button></h3>
      <span>{device.networkMode}</span>
    </div>
    <span className="device-list-item__status">{device.status === "online" ? "Connected" : "Offline"}</span>
  </article>;
}

export default DeviceListItem;
