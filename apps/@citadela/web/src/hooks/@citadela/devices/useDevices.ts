import { useCallback, useEffect, useState } from "react";
import { query } from "../../../services/@citadela/hub/graphqlClient";

export interface Device {
  id: string;
  status: "online" | "offline";
  networkMode: string;
  connectionId: string;
  connectedAt: string;
  lastHeartbeat: string;
  systemInfo?: SystemInfo;
  metrics?: SystemMetrics;
  capabilities: string[];
  permissions: string[];
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  architecture: string;
  cpuCount: number;
  memoryBytes: number;
  uptimeSeconds: number;
}
export interface SystemMetrics { cpuLoadPercent: number; memoryUsedBytes: number; memoryTotalBytes: number; collectedAt: string; }

interface DevicesQueryData {
  devices: Device[];
}

const devicesQuery = `query Devices { devices { id status networkMode connectionId connectedAt lastHeartbeat capabilities permissions systemInfo { hostname platform architecture cpuCount memoryBytes uptimeSeconds } metrics { cpuLoadPercent memoryUsedBytes memoryTotalBytes collectedAt } } }`;

export async function getDevice(deviceId: string): Promise<Device | null> {
  const data = await query<{ device: Device | null }>(`query Device($id: ID!) { device(id: $id) { id status networkMode connectionId connectedAt lastHeartbeat capabilities permissions systemInfo { hostname platform architecture cpuCount memoryBytes uptimeSeconds } metrics { cpuLoadPercent memoryUsedBytes memoryTotalBytes collectedAt } } }`, { id: deviceId });
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
    events?.addEventListener("device.metrics.updated", refreshFromEvent);
    return () => {
      window.clearTimeout(loadHandle);
      events?.removeEventListener("device.connected", refreshFromEvent);
      events?.removeEventListener("device.disconnected", refreshFromEvent);
      events?.removeEventListener("device.metrics.updated", refreshFromEvent);
      events?.close();
    };
  }, [refresh]);

  return { devices, loading, error, refresh };
}
