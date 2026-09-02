import type { CommandRecord, HubCommandService } from "../commands/command-service.js";
import type { SystemInfo } from "@citadela/protocol";
import type { DeviceRegistry, DeviceRecord } from "@citadela/device-service";

export interface HubDevice {
  id: string;
  networkMode: string;
  connectionId: string | null;
  connectedAt: string | null;
  lastHeartbeat: string;
  status: "online" | "offline";
  systemInfo?: SystemInfo;
}

export interface HubReadModel {
  listDevices(): Promise<HubDevice[]>;
  getDevice?(deviceId: string): Promise<HubDevice | undefined>;
}

export interface HubSessionSource {
  listSessions(): Array<{
    deviceId: string;
    networkMode: string;
    connectionId: string;
    connectedAt: Date;
    lastHeartbeat: Date;
    systemInfo?: SystemInfo;
  }>;
  getSession?(deviceId: string): { deviceId: string; networkMode: string; connectionId: string; connectedAt: Date; lastHeartbeat: Date; systemInfo?: SystemInfo } | undefined;
}

export class RealtimeDeviceDirectory implements HubReadModel {
  public constructor(private readonly source: HubSessionSource) {}

  public async listDevices(): Promise<HubDevice[]> {
    return this.source.listSessions().map((session) => ({
      id: session.deviceId,
      networkMode: session.networkMode,
      connectionId: session.connectionId,
      connectedAt: session.connectedAt.toISOString(),
      lastHeartbeat: session.lastHeartbeat.toISOString(),
      status: "online",
      ...(session.systemInfo ? { systemInfo: session.systemInfo } : {}),
    }));
  }

  public async getDevice(deviceId: string): Promise<HubDevice | undefined> {
    const session = this.source.getSession?.(deviceId);
    if (!session) return undefined;
    return {
      id: session.deviceId,
      networkMode: session.networkMode,
      connectionId: session.connectionId,
      connectedAt: session.connectedAt.toISOString(),
      lastHeartbeat: session.lastHeartbeat.toISOString(),
      status: "online",
      ...(session.systemInfo ? { systemInfo: session.systemInfo } : {}),
    };
  }
}

export class PersistentDeviceDirectory implements HubReadModel {
  public constructor(private readonly registry: DeviceRegistry, private readonly source: HubSessionSource) {}

  public async listDevices(): Promise<HubDevice[]> {
    const records = await this.registry.list();
    const active = new Map(this.source.listSessions().map((session) => [session.deviceId, session]));
    return records.map((record) => deviceView(record, active.get(record.deviceId)));
  }

  public async getDevice(deviceId: string): Promise<HubDevice | undefined> {
    const record = await this.registry.get(deviceId);
    return record ? deviceView(record, this.source.getSession?.(deviceId)) : undefined;
  }
}

function deviceView(record: DeviceRecord, active: ReturnType<NonNullable<HubSessionSource["getSession"]>>): HubDevice {
  return {
    id: record.deviceId,
    networkMode: active?.networkMode ?? record.networkMode,
    connectionId: active?.connectionId ?? record.connectionId,
    connectedAt: active?.connectedAt.toISOString() ?? record.connectedAt?.toISOString() ?? null,
    lastHeartbeat: active?.lastHeartbeat.toISOString() ?? record.lastSeenAt.toISOString(),
    status: active ? "online" : record.status,
    ...(active?.systemInfo ? { systemInfo: active.systemInfo } : record.systemInfo ? { systemInfo: record.systemInfo } : {}),
  };
}

export interface HubGraphqlContext {
  actorId: string;
  commandService: HubCommandService;
  readModel: HubReadModel;
}

export function commandView(record: CommandRecord): Record<string, unknown> {
  return {
    id: record.command.id,
    deviceId: record.command.deviceId,
    type: record.command.type,
    state: record.state,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    confirmedAt: record.confirmedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    error: record.error ?? null,
  };
}
