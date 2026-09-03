import { PiDeviceTabletSpeaker } from "react-icons/pi";
import DeviceListItem from "../../../components/@citadela/composed/devices/DeviceListItem";
import EmptyStateCard from "../../../components/@citadela/composed/cards/EmptyStateCard";
import PairingRequestList from "../../../components/@citadela/composed/devices/PairingRequestList";
import { useDevices } from "../../../hooks/@citadela/devices/useDevices";
import { usePairingRequests } from "../../../hooks/@citadela/devices/usePairingRequests";

function DevicesView() {
  const { devices, loading, error } = useDevices();
  const pairing = usePairingRequests();

  return <section className="flex min-w-0 flex-col gap-6" aria-labelledby="devices-view-title">
    <h2 id="devices-view-title" className="sr-only">Devices</h2>
    {loading ? <p>Loading devices…</p> : null}
    {error ? <p role="alert">{error.message}</p> : null}
    {!loading && !error && devices.length === 0 ? <EmptyStateCard icon={<PiDeviceTabletSpeaker />} title="No devices yet" description="Pair a device to manage it from your Citadela Hub." /> : null}
    {!loading && !error && devices.length > 0 ? <div className="devices-view__list">{devices.map((device) => <DeviceListItem key={device.id} device={device} />)}</div> : null}
    <section className="ui-card p-0" aria-labelledby="pairing-requests-title">
      <header className="px-4 py-3"><h3 id="pairing-requests-title" className="font-heading text-sm font-semibold text-primary">Pairing requests</h3></header>
      <div className="ui-card-body rounded-t-lg p-4">
        {pairing.loading ? <p className="text-xs text-muted">Loading pairing requests…</p> : null}
        {pairing.error ? <p className="text-xs text-red-200" role="alert">{pairing.error.message}</p> : null}
        {!pairing.loading && !pairing.error ? <PairingRequestList requests={pairing.requests} actingRequestId={pairing.actingRequestId} onApprove={(requestId) => void pairing.approve(requestId)} onReject={(requestId) => void pairing.reject(requestId)} /> : null}
      </div>
    </section>
  </section>;
}

export default DevicesView;
