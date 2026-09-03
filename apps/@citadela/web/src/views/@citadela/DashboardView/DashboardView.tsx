import { useDevices } from "../../../hooks/@citadela/devices/useDevices";
import LayerCard from "../../../components/@citadela/base/cards/LayerCard";
import { useEffect, useState } from "react";
import { query } from "../../../services/@citadela/hub/graphqlClient";

function DashboardView() {
  const { devices, loading, error } = useDevices();
  const online = devices.filter((device) => device.status === "online").length;
  const [recentCommands, setRecentCommands] = useState<Array<{ id: string; deviceId: string; type: string; state: string }>>([]);
  const [lifecycleEvents, setLifecycleEvents] = useState(0);
  useEffect(() => { let active = true; void Promise.all(devices.slice(0, 20).map((device) => query<{ commands: Array<{ id: string; deviceId: string; type: string; state: string }> }>("query DashboardCommands($deviceId: ID!) { commands(deviceId: $deviceId, limit: 3) { id deviceId type state } }", { deviceId: device.id }))).then((results) => { if (active) setRecentCommands(results.flatMap((result) => result.commands)); }); return () => { active = false; }; }, [devices]);
  useEffect(() => { if (!("EventSource" in window)) return undefined; const events = new EventSource("/api/v1/events"); const update = () => setLifecycleEvents((value) => value + 1); events.addEventListener("device.connected", update); events.addEventListener("device.disconnected", update); return () => { events.close(); }; }, []);
  return <section className="flex min-w-0 flex-col gap-6" aria-labelledby="dashboard-view-title">
    <h2 id="dashboard-view-title" className="sr-only">Dashboard</h2>
    {loading ? <p className="text-xs text-muted">Loading dashboard…</p> : null}
    {error ? <p className="text-xs text-red-300" role="alert">{error.message}</p> : null}
    {!loading && !error ? <dl className="grid gap-3 sm:grid-cols-3">{[["Connected devices", online], ["Offline devices", devices.length - online], ["Total devices", devices.length]].map(([label, value]) => <div className="ui-card p-4" key={String(label)}><dt className="text-xs text-muted">{label}</dt><dd className="mt-2 font-heading text-2xl font-semibold text-primary">{value}</dd></div>)}</dl> : null}
    {!loading && !error ? <LayerCard title="Recent command activity"><>{recentCommands.length ? <ul className="flex flex-col gap-2 text-xs text-muted">{recentCommands.map((command) => <li className="border-t border-line pt-2 first:border-t-0" key={command.id}>{command.deviceId}: {command.type} - {command.state}</li>)}</ul> : <p className="text-xs text-muted">No recent commands.</p>}<div className="mt-4 flex gap-4 border-t border-line pt-3 text-xs text-muted"><span>Lifecycle events: {lifecycleEvents}</span><span>Metrics-capable devices: {devices.filter((device) => Boolean(device.metrics)).length}</span></div></></LayerCard> : null}
  </section>;
}

export default DashboardView;
