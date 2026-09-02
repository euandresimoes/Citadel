import { useEffect, useState } from "react";
import { getDevice, type Device } from "../../../hooks/@citadela/devices/useDevices";

interface DeviceDetailViewProps { deviceId: string; }

function DeviceDetailView({ deviceId }: DeviceDetailViewProps) {
  const [device, setDevice] = useState<Device | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    void getDevice(deviceId).then((value) => { if (active) setDevice(value); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause : new Error("Unable to load device")); });
    return () => { active = false; };
  }, [deviceId]);

  if (error) return <section aria-label="Device details"><p role="alert">{error.message}</p></section>;
  if (!device) return <section aria-label="Device details"><p>Loading device…</p></section>;
  return <section aria-labelledby="device-detail-title">
    <h2 id="device-detail-title">{device.id}</h2>
    <p>{device.networkMode} · Connected</p>
    {device.systemInfo ? <dl>
      <dt>Hostname</dt><dd>{device.systemInfo.hostname}</dd>
      <dt>Platform</dt><dd>{device.systemInfo.platform}</dd>
      <dt>Architecture</dt><dd>{device.systemInfo.architecture}</dd>
      <dt>CPU cores</dt><dd>{device.systemInfo.cpuCount}</dd>
      <dt>Memory</dt><dd>{Math.round(device.systemInfo.memoryBytes / 1024 / 1024)} MB</dd>
      <dt>Uptime</dt><dd>{device.systemInfo.uptimeSeconds}s</dd>
    </dl> : <p>System information is not available yet.</p>}
  </section>;
}

export default DeviceDetailView;
