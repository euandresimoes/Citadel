import "./DashboardView.scss";
import { useDevices } from "../../../hooks/@citadela/devices/useDevices";

function DashboardView() {
  const { devices, loading, error } = useDevices();
  const online = devices.filter((device) => device.status === "online").length;
  return <section className="dashboard-view" aria-labelledby="dashboard-view-title">
    <h2 id="dashboard-view-title">Dashboard</h2>
    {loading ? <p>Loading dashboard…</p> : null}
    {error ? <p role="alert">{error.message}</p> : null}
    {!loading && !error ? <dl><dt>Connected devices</dt><dd>{online}</dd><dt>Offline devices</dt><dd>{devices.length - online}</dd><dt>Total devices</dt><dd>{devices.length}</dd></dl> : null}
  </section>;
}

export default DashboardView;
