import { useState } from "react";
import ConfirmationDialog from "../dialogs/ConfirmationDialog";
import ButtonDelete from "../../base/buttons/ButtonDelete";
import type { CommandRecord, DevicePowerAction } from "../../../../services/@citadela/hub/hubApi";
import { useDeviceCommands } from "../../../../hooks/@citadela/devices/useDeviceCommands";
import "./DeviceActionsPanel.scss";

const actions: Array<{ type: DevicePowerAction; label: string; title: string; message: string }> = [
  { type: "device.system.power.sleep", label: "Sleep", title: "Put device to sleep?", message: "The device will enter sleep mode and may disconnect temporarily." },
  { type: "device.system.power.restart", label: "Restart", title: "Restart device?", message: "The device will restart and become temporarily unavailable." },
  { type: "device.system.power.shutdown", label: "Shutdown", title: "Shut down device?", message: "The device will shut down and remain offline until started again." },
];

function DeviceActionsPanel({ deviceId, online, capabilities = [], permissions = [] }: { deviceId: string; online: boolean; capabilities?: string[]; permissions?: string[] }) {
  const { commands, error, acting, create, confirm } = useDeviceCommands(deviceId);
  const [selected, setSelected] = useState<typeof actions[number] | null>(null);
  const [pendingCommand, setPendingCommand] = useState<CommandRecord | null>(null);
  const [stateFilter, setStateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const visibleCommands = commands.filter((command) => (stateFilter === "all" || command.state === stateFilter) && (typeFilter === "all" || command.type === typeFilter));

  const choose = async (action: typeof actions[number]) => {
    const requested = await create(action.type);
    const dispatched = requested.state === "awaiting_confirmation" ? await confirm(requested.id) : requested;
    setPendingCommand(dispatched);
    setSelected(null);
  };
  const legacyAccess = capabilities.length === 0 && permissions.length === 0;
  const allowed = (type: DevicePowerAction) => legacyAccess || (capabilities.includes(`capability.system.power.${type.split(".").at(-1)}`) && permissions.includes(`permission.system.power.${type.split(".").at(-1)}`));
  return <section aria-labelledby="device-actions-title" className="device-actions-panel">
    <h3 id="device-actions-title">Actions</h3>
    {!online ? <p>Actions are unavailable while the device is offline.</p> : actions.every((action) => !allowed(action.type)) ? <p>Power actions are unavailable for this device.</p> : <div className="device-actions-panel__buttons">
      {actions.filter((action) => allowed(action.type)).map((action) => <ButtonDelete key={action.type} disabled={acting} onClick={() => setSelected(action)}>{action.label}</ButtonDelete>)}
    </div>}
    {error ? <p role="alert">{error.message}</p> : null}
    {pendingCommand ? <p role="status">{pendingCommand.type.split(".").at(-1)}: {pendingCommand.state}</p> : null}
    <section aria-labelledby="command-history-title"><h4 id="command-history-title">Command history</h4>
      <label>State <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="all">All</option><option value="awaiting_confirmation">Awaiting confirmation</option><option value="dispatched">Dispatched</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="expired">Expired</option></select></label>
      <label>Action <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All</option>{actions.map((action) => <option key={action.type} value={action.type}>{action.label}</option>)}</select></label>
      {visibleCommands.length > 0 ? <ul aria-label="Command history">{visibleCommands.map((command) => <li key={command.id}>{command.type}: {command.state} · {new Date(command.createdAt).toLocaleString()}{command.error ? ` — ${command.error}` : ""}</li>)}</ul> : <p>No commands match the selected filters.</p>}
    </section>
    <ConfirmationDialog open={selected !== null} title={selected?.title ?? "Confirm action"} message={selected?.message ?? "Confirm this action."} confirmLabel={selected?.label} onCancel={() => setSelected(null)} onConfirm={async () => { if (selected) await choose(selected); }} />
  </section>;
}

export default DeviceActionsPanel;
