import type { DeviceIdentity, NetworkMode, SystemInfo } from "@citadela/protocol";

export type DeviceStatus = "online" | "offline";

export interface DeviceRecord {
  deviceId: string;
  identity: DeviceIdentity;
  networkMode: NetworkMode;
  connectionId: string | null;
  status: DeviceStatus;
  connectedAt: Date | null;
  lastSeenAt: Date;
  systemInfo: SystemInfo | null;
}

export interface DeviceRegistry {
  upsertConnected(deviceId: string, identity: DeviceIdentity, networkMode: NetworkMode, connectionId: string, connectedAt: Date): Promise<void>;
  updateHeartbeat(deviceId: string, connectionId: string, lastSeenAt: Date): Promise<void>;
  updateSystemInfo(deviceId: string, connectionId: string, systemInfo: SystemInfo): Promise<void>;
  markDisconnected(deviceId: string, connectionId: string, lastSeenAt: Date): Promise<void>;
  markAllOffline(lastSeenAt: Date): Promise<void>;
  list(): Promise<DeviceRecord[]>;
  get(deviceId: string): Promise<DeviceRecord | undefined>;
}

export class InMemoryDeviceRegistry implements DeviceRegistry {
  private readonly records = new Map<string, DeviceRecord>();

  public async upsertConnected(deviceId: string, identity: DeviceIdentity, networkMode: NetworkMode, connectionId: string, connectedAt: Date): Promise<void> {
    const previous = this.records.get(deviceId);
    this.records.set(deviceId, { deviceId, identity, networkMode, connectionId, status: "online", connectedAt, lastSeenAt: connectedAt, systemInfo: previous?.systemInfo ?? null });
  }
  public async updateHeartbeat(deviceId: string, connectionId: string, lastSeenAt: Date): Promise<void> {
    const record = this.records.get(deviceId);
    if (record?.connectionId === connectionId) { record.lastSeenAt = lastSeenAt; record.status = "online"; }
  }
  public async updateSystemInfo(deviceId: string, connectionId: string, systemInfo: SystemInfo): Promise<void> {
    const record = this.records.get(deviceId);
    if (record?.connectionId === connectionId) record.systemInfo = systemInfo;
  }
  public async markDisconnected(deviceId: string, connectionId: string, lastSeenAt: Date): Promise<void> {
    const record = this.records.get(deviceId);
    if (record?.connectionId === connectionId) { record.status = "offline"; record.connectionId = null; record.lastSeenAt = lastSeenAt; }
  }
  public async markAllOffline(lastSeenAt: Date): Promise<void> { for (const record of this.records.values()) { if (record.status === "online") { record.status = "offline"; record.connectionId = null; record.lastSeenAt = lastSeenAt; } } }
  public async list(): Promise<DeviceRecord[]> { return [...this.records.values()]; }
  public async get(deviceId: string): Promise<DeviceRecord | undefined> { return this.records.get(deviceId); }
}
