import { useEffect, useState } from "react";
import { getDevice, type Device } from "../../../hooks/@citadela/devices/useDevices";
import DeviceActionsPanel from "../../../components/@citadela/composed/devices/DeviceActionsPanel";
import ButtonDelete from "../../../components/@citadela/base/buttons/ButtonDelete";
import ConfirmationDialog from "../../../components/@citadela/composed/dialogs/ConfirmationDialog";
import { hubApi } from "../../../services/@citadela/hub/hubApi";
import ButtonSecondary from "../../../components/@citadela/base/buttons/ButtonSecondary";

interface DeviceDetailViewProps { deviceId: string; }

function DeviceDetailView({ deviceId }: DeviceDetailViewProps) {
  const [device, setDevice] = useState<Device | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => void getDevice(deviceId).then((value) => { if (active) setDevice(value); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause : new Error("Unable to load device")); });
    refresh();
    const events = typeof window !== "undefined" && "EventSource" in window ? new EventSource("/api/v1/events") : undefined;
    events?.addEventListener("device.metrics.updated", refresh);
    events?.addEventListener("device.connected", refresh);
    events?.addEventListener("device.disconnected", refresh);
    const interval = window.setInterval(refresh, 35_000);
    return () => { active = false; events?.close(); window.clearInterval(interval); };
  }, [deviceId]);
  async function refreshSystemInfo() { setRefreshing(true); setError(null); try { await hubApi.requestSystemInfo(deviceId); const value = await getDevice(deviceId); setDevice(value); } catch (cause) { setError(cause instanceof Error ? cause : new Error("Unable to refresh system information")); } finally { setRefreshing(false); } }

  if (error) return <section aria-label="Device details"><p className="text-xs text-red-300" role="alert">{error.message}</p></section>;
  if (!device) return <section aria-label="Device details"><p className="text-xs text-muted">Loading device…</p></section>;
  if (revoked) return <section aria-labelledby="device-detail-title"><h2 id="device-detail-title" className="font-heading text-lg font-semibold">{deviceId}</h2><p className="mt-2 text-xs text-muted">This device has been revoked.</p></section>;
  return <section className="flex min-w-0 flex-col gap-4" aria-labelledby="device-detail-title">
    <div><h2 id="device-detail-title" className="flex items-center gap-2 font-heading text-lg font-semibold">{device.id}{device.hostRole === "hub-host" ? <span className="rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">Hub host</span> : null}</h2>
    <p className="mt-1 text-xs text-muted">{device.networkMode} · {device.status === "online" ? "Connected" : "Offline"}</p></div>
    <DeviceActionsPanel deviceId={device.id} online={device.status === "online"} capabilities={device.capabilities} permissions={device.permissions} />
    <p className="text-xs text-muted">Network provider: {device.networkMode === "lan" ? "LAN" : "Headscale"}</p>
    <ButtonDelete type="button" onClick={() => setRevokeOpen(true)}>Revoke device</ButtonDelete>
    <ConfirmationDialog open={revokeOpen} title="Revoke device" message="This permanently removes the device pairing and disconnects it." confirmLabel="Revoke" onCancel={() => setRevokeOpen(false)} onConfirm={async () => { await hubApi.revokeDevice(device.id); setRevokeOpen(false); setRevoked(true); }} />
    <ButtonSecondary type="button" onClick={() => void refreshSystemInfo()} disabled={!device || device.status !== "online" || refreshing}>{refreshing ? "Refreshing…" : "Refresh system information"}</ButtonSecondary>
    {device.systemInfo ? <dl className="grid grid-cols-2 gap-x-4 gap-y-2 ui-card p-4 text-xs"><dt className="text-muted">Hostname</dt><dd>{device.systemInfo.hostname}</dd>
      <dt>Platform</dt><dd>{device.systemInfo.platform}</dd>
      <dt>Architecture</dt><dd>{device.systemInfo.architecture}</dd>
      <dt>CPU cores</dt><dd>{device.systemInfo.cpuCount}</dd>
      <dt>Memory</dt><dd>{Math.round(device.systemInfo.memoryBytes / 1024 / 1024)} MB</dd>
      <dt>Uptime</dt><dd>{device.systemInfo.uptimeSeconds}s</dd>
    </dl> : <p className="text-xs text-muted">System information is not available yet.</p>}
    {device.metrics ? <dl className="grid grid-cols-2 gap-x-4 gap-y-2 ui-card p-4 text-xs"><dt className="text-muted">CPU load</dt><dd>{device.metrics.cpuLoadPercent}%</dd><dt className="text-muted">Memory used</dt><dd>{Math.round(device.metrics.memoryUsedBytes / 1024 / 1024)} MB / {Math.round(device.metrics.memoryTotalBytes / 1024 / 1024)} MB</dd></dl> : <p className="text-xs text-muted">Metrics are not available yet.</p>}
  </section>;
}

export default DeviceDetailView;
