import { describe, expect, it } from "vitest";
import {
  CitadelaMessageSchema,
  CommandResultSchema,
  DeviceHeartbeatMessageSchema,
  DeviceHelloMessageSchema,
  HubHelloMessageSchema,
  PROTOCOL_VERSION,
  PairingPendingMessageSchema,
  ShellCommandSchema,
} from "../src/index.js";
import { FileMessageSchema } from "../src/messages/files.js";
import { SystemMetricsSchema } from "../src/devices/system-metrics.js";
import {
  FileChunkHeaderSchema,
  FileItemSchema,
  FileOperationSchema,
  FileTransferJobSchema,
  FileTransferStateSchema,
  FileTransferAuthorizationSchema,
  FileTransferLimits,
  canTransitionFileTransfer,
  computeFileManifestDigest,
  FileErrorSchema,
} from "../src/files/index.js";
import { PERMISSIONS_BY_LEVEL } from "../src/permissions/system.js";

describe("Citadela protocol", () => {
  it("validates bounded system metrics snapshots", () => {
    expect(SystemMetricsSchema.parse({ cpuLoadPercent: 42, memoryUsedBytes: 10, memoryTotalBytes: 20, collectedAt: "2026-01-01T00:00:00.000Z" })).toBeTruthy();
    expect(() => SystemMetricsSchema.parse({ cpuLoadPercent: 101, memoryUsedBytes: 10, memoryTotalBytes: 20, collectedAt: "2026-01-01T00:00:00.000Z" })).toThrow();
  });
  it("accepts a valid device hello message", () => {
    const result = DeviceHelloMessageSchema.safeParse({
      type: "device.hello",
      deviceId: "device-01",
      connectionId: "connection-01",
      networkMode: "lan",
      protocolVersion: PROTOCOL_VERSION,
      identity: {
        algorithm: "ed25519",
        publicKey: "public-key",
        fingerprint: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
      device: {
        hostname: "workstation",
        platform: "device.platform.windows",
        architecture: "x64",
        capabilities: ["capability.system.metrics"],
        permissions: ["permission.system.metrics.read"],
      },
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.device.hostRole).toBe("standalone");
    expect(DeviceHelloMessageSchema.parse({
      type: "device.hello",
      deviceId: "hub-local",
      connectionId: "connection-hub",
      networkMode: "lan",
      protocolVersion: PROTOCOL_VERSION,
      identity: {
        algorithm: "ed25519",
        publicKey: "public-key",
        fingerprint: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
      device: { hostname: "hub", platform: "device.platform.windows", architecture: "x64", capabilities: [], permissions: [], hostRole: "hub-host" },
    }).device.hostRole).toBe("hub-host");
    expect(
      CitadelaMessageSchema.safeParse(result.success ? result.data : {}).success,
    ).toBe(true);
  });

  it("rejects unknown fields in network payloads", () => {
    const result = DeviceHeartbeatMessageSchema.safeParse({
        type: "device.heartbeat",
        deviceId: "device-01",
        connectionId: "connection-01",
      timestamp: Date.now(),
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires an error when a command fails", () => {
    expect(
      CommandResultSchema.safeParse({
        type: "command.result",
        commandId: "cmd-01",
        success: false,
      }).success,
    ).toBe(false);
  });

  it("bounds shell execution requests", () => {
    expect(ShellCommandSchema.parse({
      id: "cmd-shell-01",
      type: "device.system.shell.execute",
      deviceId: "device-01",
      executable: "whoami",
      args: [],
    }).timeoutMs).toBe(30_000);
    expect(() => ShellCommandSchema.parse({
      id: "cmd-shell-01",
      type: "device.system.shell.execute",
      deviceId: "device-01",
      executable: "whoami",
      args: [],
      timeoutMs: 999_999,
    })).toThrow();
  });

  it("accepts the hub handshake response", () => {
    expect(
      HubHelloMessageSchema.parse({
        type: "hub.hello",
        deviceId: "device-01",
        connectionId: "connection-01",
        networkMode: "lan",
        protocolVersion: PROTOCOL_VERSION,
        sessionId: "session-01",
      }).type,
    ).toBe("hub.hello");
  });

  it("accepts a pending pairing notification", () => {
    expect(
      PairingPendingMessageSchema.parse({
        type: "pairing.pending",
        requestId: "request-01",
        deviceId: "device-01",
        identity: {
          algorithm: "ed25519",
          publicKey: "public-key",
          fingerprint: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      }).type,
    ).toBe("pairing.pending");
  });

  it("validates a file item and rejects paths outside a relative root", () => {
    expect(FileItemSchema.parse({
      itemId: "item-01",
      relativePath: "projects/readme.md",
      type: "file",
      sizeBytes: 128,
      modifiedAt: "2026-09-04T00:00:00.000Z",
    }).type).toBe("file");
    expect(() => FileItemSchema.parse({
      itemId: "item-01",
      relativePath: "../secrets.txt",
      type: "file",
      sizeBytes: 128,
      modifiedAt: "2026-09-04T00:00:00.000Z",
    })).toThrow();
  });

  it("accepts valid transfer state transitions", () => {
    expect(FileTransferStateSchema.parse("created")).toBe("created");
    expect(FileTransferStateSchema.parse("verifying")).toBe("verifying");
    expect(() => FileTransferStateSchema.parse("running")).toThrow();
  });

  it("validates transfer jobs and rejects invalid limits", () => {
    expect(FileTransferJobSchema.parse({
      transferId: "transfer-01",
      sourceDeviceId: "device-a",
      destinationDeviceId: "device-b",
      sourceRootId: "root-a",
      sourcePath: "workspace/app.tar",
      destinationRootId: "root-b",
      destinationPath: "incoming/app.tar",
      operation: "copy",
      items: [],
      totalBytes: 0,
      completedBytes: 0,
      mode: "hub-mediated",
      conflictPolicy: "ask",
      state: "created",
      retryCount: 0,
      manifestDigest: "a".repeat(64),
      createdAt: "2026-09-04T00:00:00.000Z",
      expiresAt: "2026-09-04T01:00:00.000Z",
    }).state).toBe("created");
    expect(() => FileTransferJobSchema.parse({
      transferId: "transfer-01",
      sourceDeviceId: "device-a",
      destinationDeviceId: "device-b",
      sourceRootId: "root-a",
      sourcePath: "workspace/app.tar",
      destinationRootId: "root-b",
      destinationPath: "incoming/app.tar",
      operation: "copy",
      items: [],
      totalBytes: -1,
      completedBytes: 0,
      mode: "hub-mediated",
      conflictPolicy: "ask",
      state: "created",
      manifestDigest: "a".repeat(64),
      createdAt: "2026-09-04T00:00:00.000Z",
      expiresAt: "2026-09-04T01:00:00.000Z",
    })).toThrow();
  });

  it("validates ordered binary chunk metadata", () => {
    expect(FileChunkHeaderSchema.parse({
      transferId: "transfer-01",
      itemId: "item-01",
      sequence: 0,
      offsetBytes: 0,
      byteLength: 4,
      digest: "b".repeat(64),
    }).sequence).toBe(0);
    expect(() => FileChunkHeaderSchema.parse({
      transferId: "transfer-01",
      itemId: "item-01",
      sequence: -1,
      offsetBytes: 0,
      byteLength: 4,
      digest: "b".repeat(64),
    })).toThrow();
  });

  it("validates file operation conflict policies", () => {
    expect(FileOperationSchema.parse({
      operationId: "operation-01",
      type: "mkdir",
      deviceId: "device-a",
      rootId: "root-a",
      path: "workspace/new",
    }).type).toBe("mkdir");
    expect(() => FileOperationSchema.parse({
      operationId: "operation-01",
      type: "delete",
      deviceId: "device-a",
      rootId: "root-a",
      path: "workspace/new",
      conflictPolicy: "invalid",
    })).toThrow();
  });

  it("accepts file protocol control messages and rejects unknown fields", () => {
    expect(FileMessageSchema.parse({
      type: "file.operation.progress",
      protocolVersion: PROTOCOL_VERSION,
      transferId: "transfer-01",
      state: "transferring",
      completedBytes: 128,
      totalBytes: 256,
      speedBytesPerSecond: 64,
      retryCount: 0,
    }).type).toBe("file.operation.progress");
    expect(() => FileMessageSchema.parse({
      type: "file.transfer.cleanup",
      protocolVersion: PROTOCOL_VERSION,
      transferId: "transfer-01",
      unexpected: true,
    })).toThrow();
    expect(() => FileMessageSchema.parse({
      type: "file.transfer.cleanup",
      protocolVersion: 0,
      transferId: "transfer-01",
    })).toThrow();
  });

  it("enforces the transfer state machine", () => {
    expect(canTransitionFileTransfer("created", "preparing")).toBe(true);
    expect(canTransitionFileTransfer("transferring", "verifying")).toBe(true);
    expect(canTransitionFileTransfer("completed", "transferring")).toBe(false);
    expect(canTransitionFileTransfer("created", "completed")).toBe(false);
  });

  it("exposes bounded transfer limits", () => {
    expect(FileTransferLimits.maxChunkBytes).toBe(16 * 1024 * 1024);
    expect(FileTransferLimits.maxConcurrentTransfers).toBeGreaterThan(0);
  });

  it("validates operation-scoped transfer authorization", () => {
    expect(FileTransferAuthorizationSchema.parse({
      transferId: "transfer-01",
      sourceDeviceId: "device-a",
      destinationDeviceId: "device-b",
      scopes: ["file.read", "file.write"],
      issuedAt: "2026-09-04T00:00:00.000Z",
      expiresAt: "2026-09-04T01:00:00.000Z",
      nonce: "nonce-0123456789",
    }).scopes).toHaveLength(2);
    expect(() => FileTransferAuthorizationSchema.parse({
      transferId: "transfer-01",
      sourceDeviceId: "device-a",
      destinationDeviceId: "device-b",
      scopes: ["file.delete"],
      issuedAt: "2026-09-04T01:00:00.000Z",
      expiresAt: "2026-09-04T00:00:00.000Z",
      nonce: "nonce-0123456789",
    })).toThrow();
  });

  it("calculates a deterministic manifest digest", async () => {
    const items = [
      { itemId: "b", relativePath: "b.txt", type: "file" as const, sizeBytes: 2, modifiedAt: "2026-09-04T00:00:00.000Z" },
      { itemId: "a", relativePath: "a.txt", type: "file" as const, sizeBytes: 1, modifiedAt: "2026-09-04T00:00:00.000Z" },
    ];
    await expect(computeFileManifestDigest(items)).resolves.toBe(await computeFileManifestDigest([...items].reverse()));
    await expect(computeFileManifestDigest(items)).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it("serializes structured file errors", () => {
    expect(FileErrorSchema.parse({
      code: "file.permission.denied",
      message: "Access denied",
      retryable: false,
    }).code).toBe("file.permission.denied");
  });

  it("keeps filesystem permissions least-privileged by level", () => {
    expect(PERMISSIONS_BY_LEVEL.restricted).not.toContain("permission.filesystem.read");
    expect(PERMISSIONS_BY_LEVEL.operator).toContain("permission.filesystem.read");
    expect(PERMISSIONS_BY_LEVEL.operator).not.toContain("permission.filesystem.write");
    expect(PERMISSIONS_BY_LEVEL["full-control"]).toContain("permission.filesystem.delete");
  });
});
