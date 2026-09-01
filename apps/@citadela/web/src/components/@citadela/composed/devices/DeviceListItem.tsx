import type { Device } from "../../../../hooks/@citadela/devices/useDevices";
import "./DeviceListItem.scss";

interface DeviceListItemProps {
  device: Device;
}

function DeviceListItem({ device }: DeviceListItemProps) {
  return <article className="device-list-item">
    <div className="device-list-item__identity">
      <h3>{device.id}</h3>
      <span>{device.networkMode}</span>
    </div>
    <span className="device-list-item__status">Connected</span>
  </article>;
}

export default DeviceListItem;
