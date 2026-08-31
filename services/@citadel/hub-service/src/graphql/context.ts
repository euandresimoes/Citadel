import type { CommandRecord, HubCommandService } from "../commands/command-service.js";

export interface HubDevice {
  id: string;
  networkMode: string;
  connectionId: string;
  connectedAt: string;
  lastHeartbeat: string;
}

export interface HubReadModel {
  listDevices(): Promise<HubDevice[]>;
}

export interface HubSessionSource {
  listSessions(): Array<{
    deviceId: string;
    networkMode: string;
    connectionId: string;
    connectedAt: Date;
    lastHeartbeat: Date;
  }>;
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
    }));
  }
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
