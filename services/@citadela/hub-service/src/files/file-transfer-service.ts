import { randomUUID } from "node:crypto";
import {
  canTransitionFileTransfer,
  FileTransferJobSchema,
  type FileConflictPolicy,
  type FileItem,
  type FileTransferJob,
  type FileTransferMode,
  type FileTransferState,
} from "@citadela/protocol";
import type { FileTransferRecord, FileTransferRepository } from "./transfer-repository.js";
import { createFileTransferAudit, type FileTransferAuditRepository } from "./audit-repository.js";

export interface CreateFileTransferInput {
  actorId: string;
  sourceDeviceId: string;
  destinationDeviceId: string;
  sourceRootId: string;
  sourcePath: string;
  destinationRootId: string;
  destinationPath: string;
  operation: "copy" | "move";
  items: FileItem[];
  totalBytes: number;
  mode: FileTransferMode;
  conflictPolicy: FileConflictPolicy;
  manifestDigest: string;
  idempotencyKey?: string;
}

export interface HubFileServiceOptions {
  expirationTtlMs?: number;
  cleanupIntervalMs?: number;
  audit?: FileTransferAuditRepository;
}

export class FileTransferStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FileTransferStateError";
  }
}

export class HubFileService {
  private readonly idempotentJobs = new Map<string, Promise<FileTransferRecord>>();
  private readonly expirationTtlMs: number;
  private readonly audit: FileTransferAuditRepository | undefined;
  private readonly cleanupTimer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly repository: FileTransferRepository,
    options: HubFileServiceOptions = {},
  ) {
    this.expirationTtlMs = options.expirationTtlMs ?? 24 * 60 * 60 * 1000;
    this.audit = options.audit;
    if (options.cleanupIntervalMs && options.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => { void this.cleanupExpired(); }, options.cleanupIntervalMs);
      this.cleanupTimer.unref();
    }
  }

  public async create(input: CreateFileTransferInput): Promise<FileTransferRecord> {
    if (input.idempotencyKey) {
      const previous = this.idempotentJobs.get(input.idempotencyKey);
      if (previous) return previous;
    }
    const action = this.createRecord(input);
    if (input.idempotencyKey) this.idempotentJobs.set(input.idempotencyKey, action);
    return action.catch((error: unknown) => {
      if (input.idempotencyKey) this.idempotentJobs.delete(input.idempotencyKey);
      throw error;
    });
  }

  public async get(transferId: string): Promise<FileTransferRecord | undefined> {
    const record = await this.repository.get(transferId);
    if (!record) return undefined;
    if (this.expireIfNeeded(record)) await this.repository.update(record);
    return record;
  }

  public async listByDevice(deviceId: string, limit = 50): Promise<FileTransferRecord[]> {
    return this.repository.listByDevice(deviceId, Math.min(Math.max(limit, 1), 100));
  }
  public async listActive(limit = 1_000): Promise<FileTransferRecord[]> { return this.repository.listActive(Math.min(Math.max(limit, 1), 10_000)); }

  public async transition(transferId: string, state: FileTransferState): Promise<FileTransferRecord> {
    const record = await this.requireActiveRecord(transferId);
    if (record.job.state === state) return record;
    if (!canTransitionFileTransfer(record.job.state, state)) {
      throw new FileTransferStateError(`Transfer cannot transition from ${record.job.state} to ${state}`);
    }
    record.job = { ...record.job, state };
    await this.repository.update(record);
    await this.audit?.append(createFileTransferAudit(transferId, record.actorId, "state_changed", state));
    return record;
  }

  public async updateProgress(transferId: string, completedBytes: number, state: FileTransferState): Promise<FileTransferRecord> {
    const record = await this.requireActiveRecord(transferId);
    if (record.job.state !== state) throw new FileTransferStateError("Progress state must match the current transfer state");
    if (!Number.isSafeInteger(completedBytes) || completedBytes < 0 || completedBytes > record.job.totalBytes) {
      throw new FileTransferStateError("Transfer progress is outside the valid byte range");
    }
    record.job = { ...record.job, completedBytes };
    await this.repository.update(record);
    return record;
  }

  public async checkpoint(transferId: string, itemId: string, offsetBytes: number): Promise<FileTransferRecord> {
    const record = await this.requireActiveRecord(transferId);
    if (!["transferring", "paused"].includes(record.job.state)) throw new FileTransferStateError("Checkpoint requires an active transfer");
    if (!Number.isSafeInteger(offsetBytes) || offsetBytes < 0) throw new FileTransferStateError("Invalid transfer checkpoint");
    const checkpoints = { ...record.job.checkpoints, [itemId]: Math.max(record.job.checkpoints[itemId] ?? 0, offsetBytes) };
    const completedBytes = Math.min(record.job.totalBytes, Object.values(checkpoints).reduce((sum, value) => sum + value, 0));
    record.job = { ...record.job, checkpoints, completedBytes };
    await this.repository.update(record);
    return record;
  }

  public async verifyItem(transferId: string, itemId: string): Promise<FileTransferRecord> {
    const record = await this.requireActiveRecord(transferId);
    if (!record.job.items.some((item) => item.itemId === itemId)) throw new FileTransferStateError("Unknown transfer item");
    if (record.job.verifiedItemIds.includes(itemId)) return record;
    record.job = { ...record.job, verifiedItemIds: [...record.job.verifiedItemIds, itemId] };
    await this.repository.update(record);
    return record;
  }

  public async fail(transferId: string, error: { code: string; message: string; retryable: boolean }): Promise<FileTransferRecord> {
    const record = await this.requireActiveRecord(transferId);
    if (!canTransitionFileTransfer(record.job.state, "failed")) throw new FileTransferStateError(`Transfer cannot fail from ${record.job.state}`);
    record.job = { ...record.job, state: "failed" };
    record.error = error;
    await this.repository.update(record);
    return record;
  }

  public async retry(transferId: string): Promise<FileTransferRecord> {
    const record = await this.requireActiveRecord(transferId);
    if (record.job.state !== "failed" || !record.error?.retryable) throw new FileTransferStateError("Only retryable failed transfers can be retried");
    record.job = { ...record.job, state: "preparing", retryCount: record.job.retryCount + 1 };
    delete record.error;
    await this.repository.update(record);
    return record;
  }

  public async cleanupExpired(now = new Date()): Promise<number> { return this.repository.cleanupExpired(now); }
  public close(): void { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }

  public async pause(transferId: string): Promise<FileTransferRecord> { return this.transition(transferId, "paused"); }
  public async resume(transferId: string): Promise<FileTransferRecord> { return this.transition(transferId, "transferring"); }

  public async cancel(transferId: string): Promise<FileTransferRecord> {
    const record = await this.repository.get(transferId);
    if (!record) throw new FileTransferStateError(`Unknown transfer: ${transferId}`);
    if (record.job.state === "cancelled") return record;
    return this.transition(transferId, "cancelled");
  }

  private async createRecord(input: CreateFileTransferInput): Promise<FileTransferRecord> {
    const now = Date.now();
    const job = FileTransferJobSchema.parse({
      transferId: randomUUID(),
      sourceDeviceId: input.sourceDeviceId,
      destinationDeviceId: input.destinationDeviceId,
      sourceRootId: input.sourceRootId,
      sourcePath: input.sourcePath,
      destinationRootId: input.destinationRootId,
      destinationPath: input.destinationPath,
      operation: input.operation,
      items: input.items,
      totalBytes: input.totalBytes,
      completedBytes: 0,
      mode: input.mode,
      conflictPolicy: input.conflictPolicy,
      state: "created",
      retryCount: 0,
      checkpoints: {},
      verifiedItemIds: [],
      manifestDigest: input.manifestDigest,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.expirationTtlMs).toISOString(),
    });
    const record: FileTransferRecord = { job, actorId: input.actorId };
    await this.repository.save(record);
    await this.audit?.append(createFileTransferAudit(job.transferId, input.actorId, "created", job.state, { operation: job.operation, totalBytes: job.totalBytes }));
    return record;
  }

  private async requireActiveRecord(transferId: string): Promise<FileTransferRecord> {
    const record = await this.repository.get(transferId);
    if (!record) throw new FileTransferStateError(`Unknown transfer: ${transferId}`);
    if (this.expireIfNeeded(record)) {
      await this.repository.update(record);
      throw new FileTransferStateError("Transfer has expired");
    }
    return record;
  }

  private expireIfNeeded(record: FileTransferRecord): boolean {
    const terminal = record.job.state === "completed" || record.job.state === "cancelled" || record.job.state === "failed" || record.job.state === "expired";
    if (!terminal && Date.parse(record.job.expiresAt) <= Date.now()) {
      record.job = { ...record.job, state: "expired" };
      return true;
    }
    return false;
  }
}
