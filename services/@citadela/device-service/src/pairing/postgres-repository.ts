import { Pool } from "pg";
import type { DeviceIdentity } from "@citadela/protocol";
import type { PairingRequest, PairingRepository } from "./pairing-service.js";

interface PairingRow {
  request_id: string;
  device_id: string;
  algorithm: "ed25519";
  public_key: string;
  fingerprint: string;
  created_at: Date;
}

function identityFromRow(row: PairingRow): DeviceIdentity {
  return { algorithm: row.algorithm, publicKey: row.public_key, fingerprint: row.fingerprint };
}

function requestFromRow(row: PairingRow): PairingRequest {
  return { requestId: row.request_id, deviceId: row.device_id, identity: identityFromRow(row), createdAt: row.created_at };
}

export class PostgresPairingRepository implements PairingRepository {
  public constructor(private readonly pool: Pool) {}

  public async findPaired(deviceId: string): Promise<DeviceIdentity | undefined> {
    const result = await this.pool.query<PairingRow>(
      `SELECT request_id, device_id, algorithm, public_key, fingerprint, created_at FROM device_pairings WHERE device_id = $1 AND status = 'paired'`,
      [deviceId],
    );
    return result.rows[0] ? identityFromRow(result.rows[0]) : undefined;
  }

  public async findPending(deviceId: string, fingerprint: string): Promise<PairingRequest | undefined> {
    const result = await this.pool.query<PairingRow>(
      `SELECT request_id, device_id, algorithm, public_key, fingerprint, created_at FROM device_pairings WHERE device_id = $1 AND fingerprint = $2 AND status = 'pending'`,
      [deviceId, fingerprint],
    );
    return result.rows[0] ? requestFromRow(result.rows[0]) : undefined;
  }

  public async savePending(request: PairingRequest): Promise<void> {
    await this.pool.query(
      `INSERT INTO device_pairings (request_id, device_id, algorithm, public_key, fingerprint, status, created_at) VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
      [request.requestId, request.deviceId, request.identity.algorithm, request.identity.publicKey, request.identity.fingerprint, request.createdAt],
    );
  }

  public async listPending(): Promise<PairingRequest[]> {
    const result = await this.pool.query<PairingRow>(
      `SELECT request_id, device_id, algorithm, public_key, fingerprint, created_at FROM device_pairings WHERE status = 'pending' ORDER BY created_at ASC`,
    );
    return result.rows.map(requestFromRow);
  }

  public async approve(requestId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE device_pairings SET status = 'paired', approved_at = NOW() WHERE request_id = $1 AND status = 'pending'`,
      [requestId],
    );
    if (result.rowCount !== 1) throw new Error(`Unknown pending pairing request: ${requestId}`);
  }

  public async reject(requestId: string): Promise<void> {
    await this.pool.query(`UPDATE device_pairings SET status = 'rejected' WHERE request_id = $1 AND status = 'pending'`, [requestId]);
  }

  public async revoke(deviceId: string): Promise<void> {
    await this.pool.query(`UPDATE device_pairings SET status = 'revoked', revoked_at = NOW() WHERE device_id = $1 AND status = 'paired'`, [deviceId]);
  }
}

export function createPostgresPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}
