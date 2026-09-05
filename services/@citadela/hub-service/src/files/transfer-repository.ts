import type { Pool } from "pg";
import { FileTransferJobSchema, type FileTransferJob } from "@citadela/protocol";

export interface FileTransferRecord {
  job: FileTransferJob;
  actorId: string;
  error?: { code: string; message: string; retryable: boolean };
}

export interface FileTransferRepository {
  save(record: FileTransferRecord): Promise<void>;
  get(transferId: string): Promise<FileTransferRecord | undefined>;
  update(record: FileTransferRecord): Promise<void>;
  listByDevice(deviceId: string, limit: number): Promise<FileTransferRecord[]>;
  listActive(limit: number): Promise<FileTransferRecord[]>;
  cleanupExpired(now: Date): Promise<number>;
}

export class InMemoryFileTransferRepository implements FileTransferRepository {
  private readonly records = new Map<string, FileTransferRecord>();
  public async save(record: FileTransferRecord): Promise<void> { this.records.set(record.job.transferId, record); }
  public async get(transferId: string): Promise<FileTransferRecord | undefined> { return this.records.get(transferId); }
  public async update(record: FileTransferRecord): Promise<void> { this.records.set(record.job.transferId, record); }
  public async listByDevice(deviceId: string, limit: number): Promise<FileTransferRecord[]> {
    return [...this.records.values()].filter((record) => record.job.sourceDeviceId === deviceId || record.job.destinationDeviceId === deviceId).sort((a, b) => b.job.createdAt.localeCompare(a.job.createdAt)).slice(0, limit);
  }
  public async listActive(limit: number): Promise<FileTransferRecord[]> {
    return [...this.records.values()].filter((record) => ["preparing", "transferring", "paused", "verifying", "committing"].includes(record.job.state)).slice(0, limit);
  }
  public async cleanupExpired(now: Date): Promise<number> {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.job.state !== "expired" && Date.parse(record.job.expiresAt) <= now.getTime()) {
        record.job = { ...record.job, state: "expired" };
        count += 1;
      }
    }
    return count;
  }
}

interface FileTransferRow {
  transfer_id: string;
  source_device_id: string;
  destination_device_id: string;
  source_root_id: string;
  source_path: string;
  destination_root_id: string;
  destination_path: string;
  operation: FileTransferJob["operation"];
  items: unknown;
  total_bytes: string | number;
  completed_bytes: string | number;
  mode: FileTransferJob["mode"];
  conflict_policy: FileTransferJob["conflictPolicy"];
  state: FileTransferJob["state"];
  retry_count: number;
  checkpoints: unknown;
  verified_item_ids: unknown;
  manifest_digest: string;
  created_at: Date;
  expires_at: Date;
  actor_id: string;
  error: FileTransferRecord["error"] | null;
}

function recordFromRow(row: FileTransferRow): FileTransferRecord {
  return {
    job: FileTransferJobSchema.parse({
      transferId: row.transfer_id,
      sourceDeviceId: row.source_device_id,
      destinationDeviceId: row.destination_device_id,
      sourceRootId: row.source_root_id,
      sourcePath: row.source_path,
      destinationRootId: row.destination_root_id,
      destinationPath: row.destination_path,
      operation: row.operation,
      items: row.items,
      totalBytes: Number(row.total_bytes),
      completedBytes: Number(row.completed_bytes),
      mode: row.mode,
      conflictPolicy: row.conflict_policy,
      state: row.state,
      retryCount: Number(row.retry_count),
      checkpoints: row.checkpoints ?? {},
      verifiedItemIds: Array.isArray(row.verified_item_ids) ? row.verified_item_ids : [],
      manifestDigest: row.manifest_digest,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    }),
    actorId: row.actor_id,
    ...(row.error ? { error: row.error } : {}),
  };
}

export class PostgresFileTransferRepository implements FileTransferRepository {
  public constructor(private readonly pool: Pool) {}

  public async save(record: FileTransferRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO hub_file_transfers (transfer_id, source_device_id, destination_device_id, source_root_id, source_path, destination_root_id, destination_path, operation, items, total_bytes, completed_bytes, mode, conflict_policy, state, retry_count, checkpoints, verified_item_ids, manifest_digest, created_at, expires_at, actor_id, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      [record.job.transferId, record.job.sourceDeviceId, record.job.destinationDeviceId, record.job.sourceRootId, record.job.sourcePath, record.job.destinationRootId, record.job.destinationPath, record.job.operation, JSON.stringify(record.job.items), record.job.totalBytes, record.job.completedBytes, record.job.mode, record.job.conflictPolicy, record.job.state, record.job.retryCount, JSON.stringify(record.job.checkpoints), JSON.stringify(record.job.verifiedItemIds), record.job.manifestDigest, new Date(record.job.createdAt), new Date(record.job.expiresAt), record.actorId, record.error ? JSON.stringify(record.error) : null],
    );
  }

  public async get(transferId: string): Promise<FileTransferRecord | undefined> {
    const result = await this.pool.query<FileTransferRow>(`SELECT * FROM hub_file_transfers WHERE transfer_id = $1`, [transferId]);
    return result.rows[0] ? recordFromRow(result.rows[0]) : undefined;
  }

  public async update(record: FileTransferRecord): Promise<void> {
    await this.pool.query(
      `UPDATE hub_file_transfers SET completed_bytes = $2, state = $3, retry_count = $4, checkpoints = $5, verified_item_ids = $6, error = $7 WHERE transfer_id = $1`,
      [record.job.transferId, record.job.completedBytes, record.job.state, record.job.retryCount, JSON.stringify(record.job.checkpoints), JSON.stringify(record.job.verifiedItemIds), record.error ? JSON.stringify(record.error) : null],
    );
  }

  public async listByDevice(deviceId: string, limit: number): Promise<FileTransferRecord[]> {
    const result = await this.pool.query<FileTransferRow>(`SELECT * FROM hub_file_transfers WHERE source_device_id = $1 OR destination_device_id = $1 ORDER BY created_at DESC LIMIT $2`, [deviceId, limit]);
    return result.rows.map(recordFromRow);
  }
  public async listActive(limit: number): Promise<FileTransferRecord[]> {
    const result = await this.pool.query<FileTransferRow>(`SELECT * FROM hub_file_transfers WHERE state IN ('preparing', 'transferring', 'paused', 'verifying', 'committing') ORDER BY created_at ASC LIMIT $1`, [limit]);
    return result.rows.map(recordFromRow);
  }
  public async cleanupExpired(now: Date): Promise<number> {
    const result = await this.pool.query(
      `UPDATE hub_file_transfers SET state = 'expired' WHERE expires_at <= $1 AND state NOT IN ('completed', 'cancelled', 'failed', 'expired')`,
      [now],
    );
    return result.rowCount ?? 0;
  }
}
