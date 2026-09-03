import { useEffect, useMemo, useState } from "react";
import BaseModal from "../../base/modals/BaseModal";
import BaseSelect from "../../base/selects/BaseSelect";
import InputReadOnly from "../inputs/InputReadOnly";
import { hubApi } from "../../../../services/@citadela/hub/hubApi";

interface AddDeviceModalProps {
  open: boolean;
  onClose: () => void;
}

function AddDeviceModal({ open, onClose }: AddDeviceModalProps) {
  const [platform, setPlatform] = useState("linux");
  const [network, setNetwork] = useState<"lan" | "headscale">("lan");
  const [installService, setInstallService] = useState(false);
  const [lanInterfaces, setLanInterfaces] = useState<Array<{ name: string; address: string }>>([]);
  const [selectedHost, setSelectedHost] = useState("");
  useEffect(() => {
    if (!open) return;
    void hubApi.getConnectionInfo().then((info) => {
      setLanInterfaces(info.interfaces);
      setSelectedHost((current) => info.interfaces.some((item) => item.address === current) ? current : (info.interfaces[0]?.address ?? ""));
    }).catch(() => {
      setLanInterfaces([]);
      setSelectedHost("");
    });
  }, [open]);
  const hubUrl = useMemo(() => {
    const current = new URL(window.location.href);
    const protocol = current.protocol === "https:" ? "wss:" : "ws:";
    const port = current.port === "5173" ? ":45523" : current.port ? `:${current.port}` : "";
    const isLoopback = current.hostname === "localhost" || current.hostname === "127.0.0.1" || current.hostname === "[::1]";
    const host = isLoopback ? (selectedHost || lanInterfaces[0]?.address || current.hostname) : current.hostname;
    return `${protocol}//${host}${port}/realtime/`;
  }, [lanInterfaces, selectedHost]);
  const command = useMemo(() => {
    const init = `npx @citadela/cli init --hub "${hubUrl}" --network ${network}`;
    const connect = "npx @citadela/cli connect";
    return installService ? `${init} && npx @citadela/cli service install` : `${init} && ${connect}`;
  }, [hubUrl, installService, network]);

  return <BaseModal open={open} title="Add device" onClose={onClose} contentClassName="p-0">
      <main className="flex flex-col gap-4 p-4">
        <p className="text-xs leading-5 text-muted">Run the generated command on the device you want to manage. The Connector will create a pairing request that must be approved from this Hub.</p>
        <BaseSelect label="Operating system" value={platform} onChange={(event) => setPlatform(event.target.value)} options={[{ value: "linux", label: "Linux" }, { value: "windows", label: "Windows" }]} />
        <BaseSelect label="Network mode" value={network} onChange={(event) => setNetwork(event.target.value as "lan" | "headscale")} options={[{ value: "lan", label: "LAN — Same local network" }, { value: "headscale", label: "Headscale — Private remote network" }]} />
        {lanInterfaces.length > 1 ? <BaseSelect label="Hub network interface" value={selectedHost} onChange={(event) => setSelectedHost(event.target.value)} options={lanInterfaces.map((item) => ({ value: item.address, label: `${item.name} — ${item.address}` }))} /> : null}
        <section className="flex flex-col gap-4" aria-label="Connector configuration">
          <InputReadOnly label="Hub WebSocket URL" value={hubUrl} />
          <InputReadOnly label="Connector command" value={command} />
        </section>
        <label className="flex cursor-pointer items-center gap-2 pt-2 text-xs text-muted"><input className="accent-accent" type="checkbox" checked={installService} onChange={(event) => setInstallService(event.target.checked)} />Install Connector as a system service</label>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3">
          <p className="text-xs leading-5 text-muted">{platform === "windows" ? "Run the command in PowerShell as Administrator if you enable the system service." : "Run the command in a terminal with sudo privileges if you enable the system service."}</p>
          <p className="mt-2 text-xs leading-5 text-muted">After connecting, approve the new request in the Pairing requests card.</p>
        </div>
      </main>
  </BaseModal>;
}

export default AddDeviceModal;
