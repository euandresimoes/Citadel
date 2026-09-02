import "./DashboardView.scss";
import { useDevices } from "../../../hooks/@citadela/devices/useDevices";
import { useEffect, useState } from "react";
import { query } from "../../../services/@citadela/hub/graphqlClient";

function DashboardView() {
  const { devices, loading, error } = useDevices();
  const online = devices.filter((device) => device.status === "online").length;
  const [recentCommands, setRecentCommands] = useState<Array<{ id: string; deviceId: string; type: string; state: string }>>([]);
  const [lifecycleEvents, setLifecycleEvents] = useState(0);
  useEffect(() => { let active = true; void Promise.all(devices.slice(0, 20).map((device) => query<{ commands: Array<{ id: string; deviceId: string; type: string; state: string }> }>("query DashboardCommands($deviceId: ID!) { commands(deviceId: $deviceId, limit: 3) { id deviceId type state } }", { deviceId: device.id }))).then((results) => { if (active) setRecentCommands(results.flatMap((result) => result.commands)); }); return () => { active = false; }; }, [devices]);
  useEffect(() => { if (!("EventSource" in window)) return undefined; const events = new EventSource("/api/v1/events"); const update = () => setLifecycleEvents((value) => value + 1); events.addEventListener("device.connected", update); events.addEventListener("device.disconnected", update); return () => { events.close(); }; }, []);
  return <section className="dashboard-view" aria-labelledby="dashboard-view-title">
    <h2 id="dashboard-view-title">Dashboard</h2>
    {loading ? <p>Loading dashboard…</p> : null}
    {error ? <p role="alert">{error.message}</p> : null}
    {!loading && !error ? <dl><dt>Connected devices</dt><dd>{online}</dd><dt>Offline devices</dt><dd>{devices.length - online}</dd><dt>Total devices</dt><dd>{devices.length}</dd></dl> : null}
    {!loading && !error ? <><h3>Recent command activity</h3>{recentCommands.length ? <ul>{recentCommands.map((command) => <li key={command.id}>{command.deviceId}: {command.type} — {command.state}</li>)}</ul> : <p>No recent commands.</p>}<p>Lifecycle events received: {lifecycleEvents}</p><p>Metrics-capable devices: {devices.filter((device) => Boolean(device.metrics)).length}</p></> : null}
  </section>;
}

export default DashboardView;
