import DeviceListItem from "../../../components/@citadela/composed/devices/DeviceListItem";
import PairingRequestList from "../../../components/@citadela/composed/devices/PairingRequestList";
import { useDevices } from "../../../hooks/@citadela/devices/useDevices";
import { usePairingRequests } from "../../../hooks/@citadela/devices/usePairingRequests";
import "./DevicesView.scss";

function DevicesView() {
  const { devices, loading, error } = useDevices();
  const pairing = usePairingRequests();

  return <section className="devices-view" aria-labelledby="devices-view-title">
    <h2 id="devices-view-title">Devices</h2>
    {loading ? <p>Loading devices…</p> : null}
    {error ? <p role="alert">{error.message}</p> : null}
    {!loading && !error && devices.length === 0 ? <p>No devices connected.</p> : null}
    {!loading && !error && devices.length > 0 ? <div className="devices-view__list">{devices.map((device) => <DeviceListItem key={device.id} device={device} />)}</div> : null}
    <section aria-labelledby="pairing-requests-title">
      <h3 id="pairing-requests-title">Pairing requests</h3>
      {pairing.loading ? <p>Loading pairing requests…</p> : null}
      {pairing.error ? <p role="alert">{pairing.error.message}</p> : null}
      {!pairing.loading && !pairing.error ? <PairingRequestList requests={pairing.requests} actingRequestId={pairing.actingRequestId} onApprove={(requestId) => void pairing.approve(requestId)} onReject={(requestId) => void pairing.reject(requestId)} /> : null}
    </section>
  </section>;
}

export default DevicesView;
