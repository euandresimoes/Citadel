import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface FileTransferAuditRecord { auditId: string; transferId: string; actorId: string; action: string; state?: string; metadata: Record<string, string | number | boolean>; createdAt: Date; }
export interface FileTransferAuditRepository { append(record: FileTransferAuditRecord): Promise<void>; list(transferId: string): Promise<FileTransferAuditRecord[]>; }
export class InMemoryFileTransferAuditRepository implements FileTransferAuditRepository {
  private readonly records: FileTransferAuditRecord[] = [];
  public async append(record: FileTransferAuditRecord): Promise<void> { this.records.push(record); }
  public async list(transferId: string): Promise<FileTransferAuditRecord[]> { return this.records.filter((record) => record.transferId === transferId); }
}
export class PostgresFileTransferAuditRepository implements FileTransferAuditRepository {
  public constructor(private readonly pool: Pool) {}
  public async append(record: FileTransferAuditRecord): Promise<void> { await this.pool.query(`INSERT INTO hub_file_transfer_audit (audit_id, transfer_id, actor_id, action, state, metadata, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [record.auditId, record.transferId, record.actorId, record.action, record.state ?? null, JSON.stringify(record.metadata), record.createdAt]); }
  public async list(transferId: string): Promise<FileTransferAuditRecord[]> { const result = await this.pool.query(`SELECT * FROM hub_file_transfer_audit WHERE transfer_id = $1 ORDER BY created_at ASC`, [transferId]); return result.rows.map((row: { audit_id: string; transfer_id: string; actor_id: string; action: string; state: string | null; metadata: Record<string, string | number | boolean>; created_at: Date }) => ({ auditId: row.audit_id, transferId: row.transfer_id, actorId: row.actor_id, action: row.action, ...(row.state ? { state: row.state } : {}), metadata: row.metadata, createdAt: row.created_at })); }
}
export function createFileTransferAudit(transferId: string, actorId: string, action: string, state?: string, metadata: Record<string, string | number | boolean> = {}): FileTransferAuditRecord { return { auditId: randomUUID(), transferId, actorId, action, ...(state ? { state } : {}), metadata, createdAt: new Date() }; }
