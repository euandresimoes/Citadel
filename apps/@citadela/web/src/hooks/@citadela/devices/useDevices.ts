import { useCallback, useEffect, useState } from "react";
import { query } from "../../../services/@citadela/hub/graphqlClient";

export interface Device {
  id: string;
  networkMode: string;
  connectionId: string;
  connectedAt: string;
  lastHeartbeat: string;
  systemInfo?: SystemInfo;
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  architecture: string;
  cpuCount: number;
  memoryBytes: number;
  uptimeSeconds: number;
}

interface DevicesQueryData {
  devices: Device[];
}

const devicesQuery = `query Devices { devices { id networkMode connectionId connectedAt lastHeartbeat systemInfo { hostname platform architecture cpuCount memoryBytes uptimeSeconds } } }`;

export async function getDevice(deviceId: string): Promise<Device | null> {
  const data = await query<{ device: Device | null }>(`query Device($id: ID!) { device(id: $id) { id networkMode connectionId connectedAt lastHeartbeat systemInfo { hostname platform architecture cpuCount memoryBytes uptimeSeconds } } }`, { id: deviceId });
  return data.device;
}

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDevices((await query<DevicesQueryData>(devicesQuery)).devices);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Unable to load devices"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadHandle = window.setTimeout(() => void refresh(), 0);
    const events = typeof window !== "undefined" && "EventSource" in window ? new EventSource("/api/v1/events") : undefined;
    const refreshFromEvent = () => void refresh();
    events?.addEventListener("device.connected", refreshFromEvent);
    events?.addEventListener("device.disconnected", refreshFromEvent);
    return () => {
      window.clearTimeout(loadHandle);
      events?.removeEventListener("device.connected", refreshFromEvent);
      events?.removeEventListener("device.disconnected", refreshFromEvent);
      events?.close();
    };
  }, [refresh]);

  return { devices, loading, error, refresh };
}
