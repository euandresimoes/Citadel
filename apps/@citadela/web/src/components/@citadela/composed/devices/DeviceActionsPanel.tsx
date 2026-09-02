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

function DeviceActionsPanel({ deviceId, online }: { deviceId: string; online: boolean }) {
  const { commands, error, acting, create, confirm } = useDeviceCommands(deviceId);
  const [selected, setSelected] = useState<typeof actions[number] | null>(null);
  const [pendingCommand, setPendingCommand] = useState<CommandRecord | null>(null);

  const choose = async (action: typeof actions[number]) => {
    const requested = await create(action.type);
    const dispatched = requested.state === "awaiting_confirmation" ? await confirm(requested.id) : requested;
    setPendingCommand(dispatched);
    setSelected(null);
  };
  return <section aria-labelledby="device-actions-title" className="device-actions-panel">
    <h3 id="device-actions-title">Actions</h3>
    {!online ? <p>Actions are unavailable while the device is offline.</p> : <div className="device-actions-panel__buttons">
      {actions.map((action) => <ButtonDelete key={action.type} disabled={acting} onClick={() => setSelected(action)}>{action.label}</ButtonDelete>)}
    </div>}
    {error ? <p role="alert">{error.message}</p> : null}
    {pendingCommand ? <p role="status">{pendingCommand.type.split(".").at(-1)}: {pendingCommand.state}</p> : null}
    {commands.length > 0 ? <ul aria-label="Command history">{commands.map((command) => <li key={command.id}>{command.type}: {command.state}{command.error ? ` — ${command.error}` : ""}</li>)}</ul> : null}
    <ConfirmationDialog open={selected !== null} title={selected?.title ?? "Confirm action"} message={selected?.message ?? "Confirm this action."} confirmLabel={selected?.label} onCancel={() => setSelected(null)} onConfirm={async () => { if (selected) await choose(selected); }} />
  </section>;
}

export default DeviceActionsPanel;
