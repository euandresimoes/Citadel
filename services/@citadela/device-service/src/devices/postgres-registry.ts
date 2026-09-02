import type { Capability, DeviceIdentity, NetworkMode, Permission, SystemInfo, SystemMetrics } from "@citadela/protocol";
import type { Pool } from "pg";
import type { DeviceRecord, DeviceRegistry, DeviceStatus } from "./device-registry.js";

interface DeviceRow { device_id: string; algorithm: "ed25519"; public_key: string; fingerprint: string; network_mode: NetworkMode; connection_id: string | null; status: DeviceStatus; connected_at: Date | null; last_seen_at: Date; system_info: SystemInfo | null; metrics: SystemMetrics | null; capabilities: Capability[] | null; permissions: Permission[] | null; }

function fromRow(row: DeviceRow): DeviceRecord { return { deviceId: row.device_id, identity: { algorithm: row.algorithm, publicKey: row.public_key, fingerprint: row.fingerprint }, networkMode: row.network_mode, connectionId: row.connection_id, status: row.status, connectedAt: row.connected_at, lastSeenAt: row.last_seen_at, systemInfo: row.system_info, metrics: row.metrics, capabilities: row.capabilities ?? [], permissions: row.permissions ?? [] }; }

export class PostgresDeviceRegistry implements DeviceRegistry {
  public constructor(private readonly pool: Pool) {}
  public async upsertConnected(deviceId: string, identity: DeviceIdentity, networkMode: NetworkMode, connectionId: string, connectedAt: Date, capabilities: Capability[] = [], permissions: Permission[] = []): Promise<void> {
    await this.pool.query(`INSERT INTO devices (device_id, algorithm, public_key, fingerprint, network_mode, connection_id, status, connected_at, last_seen_at, capabilities, permissions) VALUES ($1,$2,$3,$4,$5,$6,'online',$7,$7,$8::jsonb,$9::jsonb) ON CONFLICT (device_id) DO UPDATE SET algorithm=EXCLUDED.algorithm, public_key=EXCLUDED.public_key, fingerprint=EXCLUDED.fingerprint, network_mode=EXCLUDED.network_mode, connection_id=EXCLUDED.connection_id, status='online', connected_at=EXCLUDED.connected_at, last_seen_at=EXCLUDED.last_seen_at, capabilities=EXCLUDED.capabilities, permissions=EXCLUDED.permissions, updated_at=NOW()`, [deviceId, identity.algorithm, identity.publicKey, identity.fingerprint, networkMode, connectionId, connectedAt, JSON.stringify(capabilities), JSON.stringify(permissions)]);
  }
  public async updateHeartbeat(deviceId: string, connectionId: string, lastSeenAt: Date): Promise<void> { await this.pool.query(`UPDATE devices SET last_seen_at=$3, status='online', updated_at=NOW() WHERE device_id=$1 AND connection_id=$2`, [deviceId, connectionId, lastSeenAt]); }
  public async updateSystemInfo(deviceId: string, connectionId: string, systemInfo: SystemInfo): Promise<void> { await this.pool.query(`UPDATE devices SET system_info=$3::jsonb, updated_at=NOW() WHERE device_id=$1 AND connection_id=$2`, [deviceId, connectionId, JSON.stringify(systemInfo)]); }
  public async updateMetrics(deviceId: string, connectionId: string, metrics: SystemMetrics): Promise<void> { await this.pool.query(`UPDATE devices SET metrics=$3::jsonb, updated_at=NOW() WHERE device_id=$1 AND connection_id=$2`, [deviceId, connectionId, JSON.stringify(metrics)]); }
  public async markDisconnected(deviceId: string, connectionId: string, lastSeenAt: Date): Promise<void> { await this.pool.query(`UPDATE devices SET status='offline', connection_id=NULL, last_seen_at=$3, updated_at=NOW() WHERE device_id=$1 AND connection_id=$2`, [deviceId, connectionId, lastSeenAt]); }
  public async markAllOffline(lastSeenAt: Date): Promise<void> { await this.pool.query(`UPDATE devices SET status='offline', connection_id=NULL, last_seen_at=$1, updated_at=NOW() WHERE status='online'`, [lastSeenAt]); }
  public async list(): Promise<DeviceRecord[]> { const result = await this.pool.query<DeviceRow>(`SELECT * FROM devices ORDER BY device_id`); return result.rows.map(fromRow); }
  public async get(deviceId: string): Promise<DeviceRecord | undefined> { const result = await this.pool.query<DeviceRow>(`SELECT * FROM devices WHERE device_id=$1`, [deviceId]); return result.rows[0] ? fromRow(result.rows[0]) : undefined; }
}
