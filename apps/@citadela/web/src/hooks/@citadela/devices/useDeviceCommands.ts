import { useCallback, useEffect, useState } from "react";
import { hubApi, type CommandRecord, type DevicePowerAction } from "../../../services/@citadela/hub/hubApi";

export function useDeviceCommands(deviceId: string) {
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [acting, setActing] = useState(false);

  const track = useCallback((command: CommandRecord) => { setCommands((current) => [command, ...current.filter((item) => item.id !== command.id)].slice(0, 10)); return command; }, []);
  const create = useCallback(async (type: DevicePowerAction): Promise<CommandRecord> => {
    setActing(true); setError(null);
    try { return track(await hubApi.createCommand(deviceId, type)); }
    catch (cause: unknown) { const value = cause instanceof Error ? cause : new Error("Unable to create command"); setError(value); throw value; }
    finally { setActing(false); }
  }, [deviceId, track]);
  const confirm = useCallback(async (commandId: string): Promise<CommandRecord> => {
    setActing(true); setError(null);
    try { return track(await hubApi.confirmCommand(commandId)); }
    catch (cause: unknown) { const value = cause instanceof Error ? cause : new Error("Unable to confirm command"); setError(value); throw value; }
    finally { setActing(false); }
  }, [track]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const events = new EventSource("/api/v1/events");
    const update = (event: Event) => {
      const data = JSON.parse((event as MessageEvent<string>).data) as Partial<CommandRecord>;
      if (data.deviceId === deviceId && typeof data.id === "string") void hubApi.getCommand(data.id).then(track).catch(() => undefined);
    };
    events.addEventListener("command.updated", update);
    return () => { events.removeEventListener("command.updated", update); events.close(); };
  }, [deviceId, track]);

  return { commands, error, acting, create, confirm };
}
