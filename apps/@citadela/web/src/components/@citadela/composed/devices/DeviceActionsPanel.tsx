import { useState } from "react";
import ConfirmationDialog from "../dialogs/ConfirmationDialog";
import ButtonDelete from "../../base/buttons/ButtonDelete";
import BaseSelect from "../../base/selects/BaseSelect";
import type { DevicePowerAction } from "../../../../services/@citadela/hub/hubApi";
import { useDeviceCommands } from "../../../../hooks/@citadela/devices/useDeviceCommands";

const actions: Array<{ type: DevicePowerAction; label: string; title: string; message: string }> = [
  { type: "device.system.power.sleep", label: "Sleep", title: "Put device to sleep?", message: "The device will enter sleep mode and may disconnect temporarily." },
  { type: "device.system.power.restart", label: "Restart", title: "Restart device?", message: "The device will restart and become temporarily unavailable." },
  { type: "device.system.power.shutdown", label: "Shutdown", title: "Shut down device?", message: "The device will shut down and remain offline until started again." },
];

function DeviceActionsPanel({ deviceId, online, capabilities = [], permissions = [] }: { deviceId: string; online: boolean; capabilities?: string[]; permissions?: string[] }) {
  const { commands, error, acting, create, confirm } = useDeviceCommands(deviceId);
  const [selected, setSelected] = useState<typeof actions[number] | null>(null);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const pendingCommand = pendingCommandId ? commands.find((command) => command.id === pendingCommandId) ?? null : null;
  const visibleCommands = commands.filter((command) => (stateFilter === "all" || command.state === stateFilter) && (typeFilter === "all" || command.type === typeFilter));

  const choose = async (action: typeof actions[number]) => {
    const requested = await create(action.type);
    const dispatched = requested.state === "awaiting_confirmation" ? await confirm(requested.id) : requested;
    setPendingCommandId(dispatched.id);
    setSelected(null);
  };
  const legacyAccess = capabilities.length === 0 && permissions.length === 0;
  const allowed = (type: DevicePowerAction) => legacyAccess || (capabilities.includes(`capability.system.power.${type.split(".").at(-1)}`) && permissions.includes(`permission.system.power.${type.split(".").at(-1)}`));
  return <section aria-labelledby="device-actions-title" className="ui-card flex flex-col gap-3 p-3">
    <header className="px-1 pb-1"><h3 id="device-actions-title" className="font-heading text-sm font-semibold text-primary">Actions</h3></header>
    <div className="ui-card-body flex flex-col gap-4">
    {!online ? <p className="text-xs text-muted">Actions are unavailable while the device is offline.</p> : actions.every((action) => !allowed(action.type)) ? <p className="text-xs text-muted">Power actions are unavailable for this device.</p> : <div className="flex gap-3">
      {actions.filter((action) => allowed(action.type)).map((action) => <ButtonDelete key={action.type} disabled={acting} onClick={() => setSelected(action)}>{action.label}</ButtonDelete>)}
    </div>}
    {error ? <p className="text-xs text-red-200" role="alert">{error.message}</p> : null}
    {pendingCommand ? <p className="text-xs text-emerald-400" role="status">{pendingCommand.type.split(".").at(-1)}: {pendingCommand.state}</p> : null}
    <section className="border-t border-white/[0.08] pt-4" aria-labelledby="command-history-title"><h4 id="command-history-title" className="font-heading text-sm font-semibold text-primary">Command history</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><BaseSelect label="State" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} options={[{ value: "all", label: "All" }, { value: "awaiting_confirmation", label: "Awaiting confirmation" }, { value: "dispatched", label: "Dispatched" }, { value: "succeeded", label: "Succeeded" }, { value: "failed", label: "Failed" }, { value: "expired", label: "Expired" }]} /><BaseSelect label="Action" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} options={[{ value: "all", label: "All" }, ...actions.map((action) => ({ value: action.type, label: action.label }))]} /></div>
      {visibleCommands.length > 0 ? <ul className="mt-4 flex flex-col gap-2 text-xs text-muted" aria-label="Command history">{visibleCommands.map((command) => <li className="border-t border-line pt-2" key={command.id}>{command.type}: {command.state} · {new Date(command.createdAt).toLocaleString()}{command.error ? ` - ${command.error}` : ""}</li>)}</ul> : <p className="mt-4 text-xs text-muted">No commands match the selected filters.</p>}
    </section>
    </div>
    <ConfirmationDialog open={selected !== null} title={selected?.title ?? "Confirm action"} message={selected?.message ?? "Confirm this action."} confirmLabel={selected?.label} onCancel={() => setSelected(null)} onConfirm={async () => { if (selected) await choose(selected); }} />
  </section>;
}

export default DeviceActionsPanel;
