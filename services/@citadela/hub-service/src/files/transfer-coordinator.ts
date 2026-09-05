import { randomUUID } from "node:crypto";
import { posix } from "node:path";
import { computeFileManifestDigest, type FileMessage } from "@citadela/protocol";
import { PROTOCOL_VERSION } from "@citadela/protocol";
import type { RealtimeService } from "@citadela/realtime-service";
import { HubFileService } from "./file-transfer-service.js";
import type { FileTransferRecord } from "./transfer-repository.js";

export class HubTransferCoordinator {
  private readonly pendingDeletes = new Map<string, { transferId: string; deviceId: string }>();
  private readonly recovering = new Set<string>();
  public constructor(private readonly transfers: HubFileService, private readonly realtime: RealtimeService) {}

  public async start(record: FileTransferRecord, tokens?: { source: string; destination: string }): Promise<FileTransferRecord> {
    if (record.job.items.length > 0 && (await computeFileManifestDigest(record.job.items)) !== record.job.manifestDigest) {
      return this.transfers.fail(record.job.transferId, { code: "manifest_mismatch", message: "Transfer manifest digest does not match the declared items", retryable: false });
    }
    const preparing = await this.transfers.transition(record.job.transferId, "preparing");
    this.realtime.registerBinaryRoute(record.job.transferId, record.job.sourceDeviceId, record.job.destinationDeviceId);
    const opened = record.job.items.length > 0 && record.job.items.every((item) => this.realtime.sendMessage(record.job.sourceDeviceId, this.openMessage(record, record.job.sourceDeviceId, "read", tokens?.source, item.itemId)) && this.realtime.sendMessage(record.job.destinationDeviceId, this.openMessage(record, record.job.destinationDeviceId, "write", tokens?.destination, item.itemId)));
    if (!opened) {
      this.realtime.unregisterBinaryRoute(record.job.transferId);
      return this.transfers.fail(record.job.transferId, { code: "device_unavailable", message: "A transfer endpoint is no longer connected", retryable: true });
    }
    return this.transfers.transition(preparing.job.transferId, "transferring");
  }

  public async recoverForDevice(deviceId: string): Promise<void> {
    const records = await this.transfers.listActive();
    for (const record of records) {
      if (record.job.sourceDeviceId !== deviceId && record.job.destinationDeviceId !== deviceId) continue;
      if (this.recovering.has(record.job.transferId)) continue;
      this.recovering.add(record.job.transferId);
      try {
        if (!["preparing", "transferring", "paused"].includes(record.job.state)) continue;
        this.realtime.registerBinaryRoute(record.job.transferId, record.job.sourceDeviceId, record.job.destinationDeviceId);
        for (const item of record.job.items) {
          this.realtime.sendMessage(record.job.sourceDeviceId, this.openMessage(record, record.job.sourceDeviceId, "read", undefined, item.itemId));
          this.realtime.sendMessage(record.job.destinationDeviceId, this.openMessage(record, record.job.destinationDeviceId, "write", undefined, item.itemId));
        }
      } finally { this.recovering.delete(record.job.transferId); }
    }
  }

  public async acknowledge(deviceId: string, ack: Extract<FileMessage, { type: "file.transfer.ack" }>): Promise<FileTransferRecord> {
    const record = await this.transfers.get(ack.transferId);
    if (!record) throw new Error("Unknown transfer acknowledgement");
    if (deviceId !== record.job.destinationDeviceId || ack.acknowledgement.transferId !== ack.transferId) throw new Error("Transfer acknowledgement is not authorized for this device");
    const updated = await this.transfers.checkpoint(ack.transferId, ack.acknowledgement.itemId, ack.acknowledgement.nextOffsetBytes);
    this.realtime.sendMessage(updated.job.sourceDeviceId, ack);
    return updated;
  }

  public async control(record: FileTransferRecord, action: "pause" | "resume" | "cancel" | "retry"): Promise<void> {
    if (action !== "retry") {
      const message = { type: `file.operation.${action}`, protocolVersion: PROTOCOL_VERSION, transferId: record.job.transferId } as Extract<FileMessage, { type: "file.operation.pause" | "file.operation.resume" | "file.operation.cancel" }>;
      this.realtime.sendMessage(record.job.sourceDeviceId, message);
      this.realtime.sendMessage(record.job.destinationDeviceId, message);
      if (action === "pause" && record.job.state === "transferring") await this.transfers.pause(record.job.transferId);
      if (action === "resume" && record.job.state === "paused") await this.transfers.resume(record.job.transferId);
      if (action === "cancel" && !["completed", "cancelled", "failed", "expired"].includes(record.job.state)) {
        await this.transfers.cancel(record.job.transferId);
        this.realtime.unregisterBinaryRoute(record.job.transferId);
      }
      return;
    }
    const retried = await this.transfers.retry(record.job.transferId);
    await this.start(retried);
  }

  public async commit(sourceDeviceId: string, message: Extract<FileMessage, { type: "file.transfer.commit" }>): Promise<boolean> {
    const record = await this.transfers.get(message.transferId);
    if (!record || record.job.sourceDeviceId !== sourceDeviceId) return false;
    const item = record.job.items.find((candidate) => candidate.itemId === message.itemId);
    if (!item || item.digest?.toLowerCase() !== message.digest.toLowerCase()) return false;
    return this.realtime.sendMessage(record.job.destinationDeviceId, message);
  }

  public async completed(message: Extract<FileMessage, { type: "file.operation.completed" }>): Promise<FileTransferRecord> {
    const record = await this.transfers.get(message.transferId);
    if (!record) throw new Error("Unknown completed transfer");
    await this.transfers.verifyItem(message.transferId, message.itemId);
    const verified = await this.transfers.get(message.transferId);
    if (!verified || verified.job.verifiedItemIds.length < verified.job.items.length) return verified ?? record;
    await this.transfers.transition(message.transferId, "verifying");
    await this.transfers.transition(message.transferId, "committing");
    if (record.job.operation === "move") {
      for (const item of record.job.items) {
        const operationId = `${record.job.transferId}:delete:${item.itemId}`;
        this.pendingDeletes.set(operationId, { transferId: record.job.transferId, deviceId: record.job.sourceDeviceId });
        const sent = this.realtime.sendMessage(record.job.sourceDeviceId, {
          type: "file.operation.create",
          protocolVersion: PROTOCOL_VERSION,
          deviceId: record.job.sourceDeviceId,
          operation: { type: "delete", operationId, deviceId: record.job.sourceDeviceId, rootId: record.job.sourceRootId, path: this.itemPath(record.job.sourcePath, item.relativePath), recursive: item.type === "directory" },
        });
        if (!sent) return this.transfers.fail(record.job.transferId, { code: "device_unavailable", message: "Source device disconnected before move cleanup", retryable: true });
      }
      return record;
    }
    this.realtime.unregisterBinaryRoute(message.transferId);
    return this.transfers.transition(message.transferId, "completed");
  }

  public async sourceDeleteAccepted(deviceId: string, message: Extract<FileMessage, { type: "file.operation.accept" }>): Promise<FileTransferRecord | undefined> {
    const pending = this.pendingDeletes.get(message.transferId);
    if (!pending || pending.deviceId !== deviceId) return undefined;
    this.pendingDeletes.delete(message.transferId);
    const remaining = [...this.pendingDeletes.values()].some((entry) => entry.transferId === pending.transferId);
    if (remaining) return this.transfers.get(pending.transferId);
    this.realtime.unregisterBinaryRoute(pending.transferId);
    return this.transfers.transition(pending.transferId, "completed");
  }

  private openMessage(record: FileTransferRecord, deviceId: string, direction: "read" | "write", token?: string, itemId?: string): Extract<FileMessage, { type: "file.transfer.open" }> {
    const item = record.job.items.find((candidate) => candidate.itemId === itemId) ?? record.job.items[0];
    if (!item) throw new Error("A transfer must contain at least one item");
    const path = direction === "read" ? this.itemPath(record.job.sourcePath, item.relativePath) : this.itemPath(record.job.destinationPath, item.relativePath);
    return { type: "file.transfer.open", protocolVersion: PROTOCOL_VERSION, transferId: record.job.transferId, deviceId, rootId: direction === "read" ? record.job.sourceRootId : record.job.destinationRootId, path, itemId: item.itemId, direction, totalBytes: item.sizeBytes, expectedDigest: item.digest ?? record.job.manifestDigest, conflictPolicy: record.job.conflictPolicy, resumeOffset: record.job.checkpoints[item.itemId] ?? 0, ...(token ? { token } : {}) } as Extract<FileMessage, { type: "file.transfer.open" }>;
  }

  private itemPath(basePath: string, relativePath: string): string {
    return relativePath === "." ? basePath : posix.join(basePath, relativePath);
  }
}
