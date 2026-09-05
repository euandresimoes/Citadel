import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { homedir } from "node:os";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import WebSocket from "ws";
import {
  CitadelaMessageSchema,
  DeviceHelloMessageSchema,
  PROTOCOL_VERSION,
  type CitadelaMessage,
  SystemInfoSchema,
  SystemMetricsSchema,
  type NetworkMode,
  type HubHelloMessage,
  type Permission,
  type ShellCommand,
  type FileMessage,
  type DeviceInfo,
} from "@citadela/protocol";
import {
  FileIdentityStore,
  loadOrCreateIdentity,
  type IdentityStore,
} from "./identity/identity.js";
import { FilePermissionPolicyStore, hasPermission, loadOrCreatePermissionPolicy, type PermissionPolicyStore } from "./permissions/policy.js";
import { LocalPrivilegedShellExecutor, type PrivilegedShellExecutor } from "./privileged/shell-ipc.js";
import { collectDeviceInfo, collectSystemInfo, collectSystemMetrics } from "./system/device-info.js";
import { createPowerCommandExecutor, type PowerCommandExecutor, type PowerCommandType } from "./power/index.js";
import { ConnectorFileService, FileOperationError, FileTransferSession, FileTransferStreamReader, FileTransferSender, decodeFileTransferFrame, type FileTransferSession as TransferSession } from "./filesystem/index.js";

export interface ConnectorOptions {
  url: string;
  deviceId: string;
  networkMode?: NetworkMode;
  heartbeatIntervalMs?: number;
  identityStore?: IdentityStore;
  permissionPolicyStore?: PermissionPolicyStore;
  autoReconnect?: boolean;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  tls?: {
    ca?: string | Buffer;
    cert?: string | Buffer;
    key?: string | Buffer;
    rejectUnauthorized?: boolean;
  };
  onMessage?: (message: CitadelaMessage) => void;
  onBinaryMessage?: (payload: Buffer) => void;
  powerExecutor?: PowerCommandExecutor;
  shellExecutor?: PrivilegedShellExecutor;
  processedCommandLimit?: number;
  fileService?: ConnectorFileService;
  hostRole?: DeviceInfo["hostRole"];
}

interface EstablishedConnection {
  url: string;
  socket: WebSocket;
  connectionId: string;
  networkMode: NetworkMode;
  hello: HubHelloMessage;
}

export class Connector {
  private socket: WebSocket | undefined;
  private connectionId: string | undefined;
  private networkMode: NetworkMode | undefined;
  private activeUrl: string | undefined;
  private activeNetworkMode: NetworkMode | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private lastPongAt = 0;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnectDelayMs: number | undefined;
  private stopped = true;
  private readonly identity;
  private readonly powerExecutor: PowerCommandExecutor;
  private readonly shellExecutor: PrivilegedShellExecutor;
  private readonly permissionPolicyStore: PermissionPolicyStore;
  private readonly processedCommandIds = new Set<string>();
  private readonly inFlightCommandIds = new Set<string>();
  private readonly fileService: ConnectorFileService | undefined;
  private readonly transferSessions = new Map<string, TransferSession>();
  private readonly transferSenders = new Map<string, FileTransferSender>();
  private readonly pendingTransferFrames = new Map<string, Buffer[]>();

  public constructor(private readonly options: ConnectorOptions) {
    const store = options.identityStore ?? new FileIdentityStore(join(homedir(), ".citadela", "identity.json"));
    this.identity = loadOrCreateIdentity(store);
    this.permissionPolicyStore = options.permissionPolicyStore ?? new FilePermissionPolicyStore();
    this.powerExecutor = options.powerExecutor ?? createPowerCommandExecutor();
    this.shellExecutor = options.shellExecutor ?? new LocalPrivilegedShellExecutor();
    this.fileService = options.fileService;
  }

  public connect(): Promise<HubHelloMessage> {
    if (this.socket) return Promise.reject(new Error("Connector is already connected"));
    this.stopped = false;
    return this.establish(this.options.url, this.options.networkMode ?? "lan").then((connection) => {
      this.reconnectDelayMs = this.options.reconnectInitialDelayMs ?? 250;
      this.activate(connection);
      return connection.hello;
    });
  }

  public switchNetwork(url: string, networkMode: NetworkMode): Promise<HubHelloMessage> {
    this.stopped = false;
    return this.establish(url, networkMode).then((connection) => {
      const previousSocket = this.socket;
      this.stopHeartbeat();
      this.activate(connection);
      previousSocket?.close(1000, "Switched network provider");
      return connection.hello;
    });
  }

  public close(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = undefined;
    this.connectionId = undefined;
    this.networkMode = undefined;
    this.activeUrl = undefined;
    this.activeNetworkMode = undefined;
    this.lastPongAt = 0;
    for (const sender of this.transferSenders.values()) sender.cancel();
    this.transferSenders.clear();
    for (const session of this.transferSessions.values()) void session.abort();
    this.transferSessions.clear();
    this.pendingTransferFrames.clear();
  }

  public sendBinary(payload: Uint8Array): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(payload);
    return true;
  }

  public registerTransferSession(transferId: string, session: TransferSession): void { this.transferSessions.set(transferKey(transferId, "default"), session); }
  public unregisterTransferSession(transferId: string): void { for (const key of this.transferSessions.keys()) if (key.startsWith(`${transferId}:`)) this.transferSessions.delete(key); }

  private async handleTransferFrame(socket: WebSocket, payload: Buffer): Promise<void> {
    try {
      const frame = decodeFileTransferFrame(payload);
      const session = this.transferSessions.get(transferKey(frame.header.transferId, frame.header.itemId));
      if (!session) {
        const key = transferKey(frame.header.transferId, frame.header.itemId);
        const frames = this.pendingTransferFrames.get(key) ?? [];
        frames.push(payload);
        this.pendingTransferFrames.set(key, frames);
        return;
      }
      const acknowledgement = await session.acceptFrame(payload);
      socket.send(JSON.stringify({ type: "file.transfer.ack", protocolVersion: PROTOCOL_VERSION, transferId: acknowledgement.transferId, acknowledgement }));
    } catch (error) {
      this.options.onMessage?.({ type: "protocol.error", code: "protocol.invalid_message", message: error instanceof Error ? error.message : "Invalid transfer frame" });
    }
  }

  private establish(url: string, networkMode: NetworkMode): Promise<EstablishedConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, this.options.tls);
      const connectionId = createConnectorConnectionId();
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(error);
      };

      socket.once("error", fail);
      socket.once("open", () => {
        socket.send(JSON.stringify(DeviceHelloMessageSchema.parse({
          type: "device.hello",
          deviceId: this.options.deviceId,
          connectionId,
          networkMode,
          protocolVersion: PROTOCOL_VERSION,
          identity: this.identity.identity,
          device: collectDeviceInfo(loadOrCreatePermissionPolicy(this.permissionPolicyStore).permissions, this.options.hostRole),
        })));
      });

      socket.on("message", (raw, isBinary) => {
        if (isBinary) {
          if (settled) {
            const payload = rawToBuffer(raw);
            this.options.onBinaryMessage?.(payload);
            void this.handleTransferFrame(socket, payload);
          }
          return;
        }
        let message: unknown;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          fail(new Error("Hub sent invalid JSON"));
          return;
        }

        const parsed = CitadelaMessageSchema.safeParse(message);
        if (!parsed.success) {
          fail(new Error("Hub sent an invalid protocol message"));
          return;
        }
        this.options.onMessage?.(parsed.data);
        if (parsed.data.type === "protocol.error") {
          fail(new Error(parsed.data.message));
          return;
        }
        if (parsed.data.type === "pairing.pending") {
          fail(new PairingRequiredError(parsed.data.requestId, parsed.data.identity.fingerprint));
          return;
        }
        if (parsed.data.type === "hub.challenge") {
          if (parsed.data.connectionId !== connectionId) {
            fail(new Error("Hub challenge does not match the active connection"));
            return;
          }
          const privateKey = createPrivateKey({
            key: Buffer.from(this.identity.privateKey, "base64"),
            format: "der",
            type: "pkcs8",
          });
          const signature = sign(null, Buffer.from(parsed.data.nonce, "base64url"), privateKey);
          socket.send(JSON.stringify({
            type: "device.auth",
            connectionId,
            signature: signature.toString("base64"),
          }));
          return;
        }
        if (isFileMessage(parsed.data)) {
          if (!settled) return;
          void this.handleFileMessage(socket, parsed.data);
          return;
        }
        if (parsed.data.type === "device.system.info.request") {
          if (!settled) return;
          if (parsed.data.deviceId !== this.options.deviceId) return;
          this.sendCommandResult(socket, parsed.data.id, async () => SystemInfoSchema.parse(collectSystemInfo()));
          return;
        }
        if (parsed.data.type === "device.system.metrics.request") {
          if (!settled || parsed.data.deviceId !== this.options.deviceId) return;
          this.sendCommandResult(socket, parsed.data.id, async () => SystemMetricsSchema.parse(collectSystemMetrics()));
          return;
        }
        if (parsed.data.type === "device.system.shell.execute") {
          const shellCommand = parsed.data as ShellCommand;
          if (!settled || shellCommand.deviceId !== this.options.deviceId) return;
          if (!hasPermission(loadOrCreatePermissionPolicy(this.permissionPolicyStore), "permission.system.terminal.use")) {
            this.sendResult(socket, { type: "command.result", commandId: shellCommand.id, success: false, error: "Permission denied by local device policy: permission.system.terminal.use" });
            return;
          }
          this.sendCommandResult(socket, shellCommand.id, () => this.shellExecutor.execute({
            executable: shellCommand.executable,
            args: shellCommand.args,
            ...(shellCommand.cwd ? { cwd: shellCommand.cwd } : {}),
            timeoutMs: shellCommand.timeoutMs,
          }));
          return;
        }
        if (isPowerCommand(parsed.data)) {
          if (!settled) return;
          if (parsed.data.deviceId !== this.options.deviceId) return;
          const permission = powerPermission(parsed.data.type);
          if (!hasPermission(loadOrCreatePermissionPolicy(this.permissionPolicyStore), permission)) {
            this.sendResult(socket, { type: "command.result", commandId: parsed.data.id, success: false, error: `Permission denied by local device policy: ${permission}` });
            return;
          }
          this.sendCommandResult(socket, parsed.data.id, () => this.powerExecutor.execute(parsed.data.type as PowerCommandType));
          return;
        }
        if (parsed.data.type !== "hub.hello") return;
        if (parsed.data.connectionId !== connectionId || parsed.data.networkMode !== networkMode) {
          fail(new Error("Hub handshake does not match the active connection"));
          return;
        }
        settled = true;
        resolve({ url, socket, connectionId, networkMode, hello: parsed.data });
      });
    });
  }

  private activate(connection: EstablishedConnection): void {
    this.socket = connection.socket;
    this.connectionId = connection.connectionId;
    this.networkMode = connection.networkMode;
    this.activeUrl = connection.url;
    this.activeNetworkMode = connection.networkMode;
    this.lastPongAt = Date.now();
    connection.socket.on("pong", () => {
      if (this.socket === connection.socket) this.lastPongAt = Date.now();
    });
    connection.socket.on("close", () => {
      if (this.socket !== connection.socket || this.stopped) return;
      for (const sender of this.transferSenders.values()) sender.cancel();
      this.transferSenders.clear();
      for (const session of this.transferSessions.values()) void session.suspend();
      this.stopHeartbeat();
      this.socket = undefined;
      this.connectionId = undefined;
      this.networkMode = undefined;
      this.lastPongAt = 0;
      this.scheduleReconnect();
    });
    this.startHeartbeat();
  }

  private scheduleReconnect(): void {
    if (this.options.autoReconnect === false || this.reconnectTimer || this.stopped) return;
    const delay = this.reconnectDelayMs ?? this.options.reconnectInitialDelayMs ?? 250;
    const maxDelay = this.options.reconnectMaxDelayMs ?? 30_000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.establish(this.activeUrl ?? this.options.url, this.activeNetworkMode ?? this.options.networkMode ?? "lan")
        .then((connection) => {
          this.reconnectDelayMs = this.options.reconnectInitialDelayMs ?? 250;
          this.activate(connection);
        })
        .catch(() => {
          this.reconnectDelayMs = Math.min(delay * 2, maxDelay);
          this.scheduleReconnect();
        });
    }, delay);
    this.reconnectTimer.unref();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = this.options.heartbeatIntervalMs ?? 30_000;
    this.heartbeatTimer = setInterval(() => {
      const socket = this.socket;
      if (socket?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastPongAt > interval * 2) {
        socket.terminate();
        return;
      }
      try {
        socket.ping();
        socket.send(JSON.stringify({
          type: "device.heartbeat",
          deviceId: this.options.deviceId,
          connectionId: this.connectionId,
          timestamp: Date.now(),
        }));
      } catch {
        socket.terminate();
      }
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private sendCommandResult(socket: WebSocket, commandId: string, execute: () => Promise<unknown>): void {
    const limit = this.options.processedCommandLimit ?? 1_000;
    if (this.processedCommandIds.has(commandId) || this.inFlightCommandIds.has(commandId)) {
      socket.send(JSON.stringify({ type: "command.result", commandId, success: false, error: "Command was already processed" }));
      return;
    }
    this.inFlightCommandIds.add(commandId);
    void execute()
      .then((data) => this.sendResult(socket, { type: "command.result", commandId, success: true, ...(data === undefined ? {} : { data }) }))
      .catch((error: unknown) => this.sendResult(socket, {
        type: "command.result",
        commandId,
        success: false,
        error: error instanceof Error ? error.message : "Command execution failed",
      }))
      .finally(() => {
        this.inFlightCommandIds.delete(commandId);
        this.processedCommandIds.add(commandId);
        while (this.processedCommandIds.size > limit) {
          const oldest = this.processedCommandIds.values().next().value as string | undefined;
          if (!oldest) break;
          this.processedCommandIds.delete(oldest);
        }
      });
  }

  private sendResult(socket: WebSocket, result: Record<string, unknown>): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(result));
  }

  private async handleFileMessage(socket: WebSocket, message: FileMessage): Promise<void> {
    if (!this.fileService) {
      this.sendFileError(socket, "Filesystem service is not enabled on this Connector");
      return;
    }
    try {
      switch (message.type) {
        case "file.roots.request":
          this.assertDevice(message.deviceId);
          this.sendResult(socket, { type: "file.roots.response", protocolVersion: PROTOCOL_VERSION, deviceId: this.options.deviceId, ...(message.requestId ? { requestId: message.requestId } : {}), roots: this.fileService.listRoots() });
          return;
        case "file.list.request":
          this.assertDevice(message.deviceId);
          this.sendResult(socket, { type: "file.list.response", protocolVersion: PROTOCOL_VERSION, deviceId: this.options.deviceId, ...(message.requestId ? { requestId: message.requestId } : {}), rootId: message.rootId, path: message.path, items: await this.fileService.list(message.rootId, message.path) });
          return;
        case "file.stat.request":
          this.assertDevice(message.deviceId);
          this.sendResult(socket, { type: "file.stat.response", protocolVersion: PROTOCOL_VERSION, deviceId: this.options.deviceId, ...(message.requestId ? { requestId: message.requestId } : {}), item: await this.fileService.stat(message.rootId, message.path) });
          return;
        case "file.operation.create":
          this.assertDevice(message.deviceId);
          if (message.operation.deviceId !== this.options.deviceId) throw new FileOperationError("file.operation.failed", "Operation device does not match the active Connector");
          await this.executeFileOperation(message.operation);
          this.sendResult(socket, { type: "file.operation.accept", protocolVersion: PROTOCOL_VERSION, transferId: message.operation.operationId, sourceDeviceId: this.options.deviceId, destinationDeviceId: this.options.deviceId });
          return;
        case "file.transfer.open":
          this.assertDevice(message.deviceId);
          await this.openTransfer(socket, message);
          return;
        case "file.transfer.ack":
          this.transferSenders.get(transferKey(message.transferId, message.acknowledgement.itemId))?.acknowledge(message.acknowledgement);
          return;
        case "file.operation.pause":
          for (const [key, sender] of this.transferSenders) if (key.startsWith(`${message.transferId}:`)) sender.pause();
          return;
        case "file.operation.resume":
          for (const [key, sender] of this.transferSenders) if (key.startsWith(`${message.transferId}:`)) sender.resume();
          return;
        case "file.operation.cancel":
          for (const [key, sender] of this.transferSenders) if (key.startsWith(`${message.transferId}:`)) sender.cancel();
          for (const [key, session] of this.transferSessions) if (key.startsWith(`${message.transferId}:`)) { await session.abort(); this.transferSessions.delete(key); }
          for (const key of this.pendingTransferFrames.keys()) if (key.startsWith(`${message.transferId}:`)) this.pendingTransferFrames.delete(key);
          return;
        case "file.transfer.commit": {
          const session = this.transferSessions.get(transferKey(message.transferId, message.itemId));
          if (session) {
            await session.commit();
            this.transferSessions.delete(transferKey(message.transferId, message.itemId));
            this.sendResult(socket, { type: "file.operation.completed", protocolVersion: PROTOCOL_VERSION, transferId: message.transferId, itemId: message.itemId });
          }
          return;
        }
        case "file.transfer.cleanup":
          for (const [key, session] of this.transferSessions) if (key.startsWith(`${message.transferId}:`)) { await session.abort(); this.transferSessions.delete(key); }
          for (const key of this.pendingTransferFrames.keys()) if (key.startsWith(`${message.transferId}:`)) this.pendingTransferFrames.delete(key);
          for (const key of this.transferSenders.keys()) if (key.startsWith(`${message.transferId}:`)) this.transferSenders.delete(key);
          return;
        default:
          return;
      }
    } catch (error) {
      this.sendFileError(socket, error instanceof Error ? error.message : "Filesystem operation failed");
    }
  }

  private async openTransfer(socket: WebSocket, message: Extract<FileMessage, { type: "file.transfer.open" }>): Promise<void> {
    if (!this.fileService) throw new FileOperationError("file.operation.failed", "Filesystem service is not enabled on this Connector");
    if (message.direction === "read") {
      const source = await FileTransferStreamReader.open({ filePath: this.fileService.resolvePath(message.rootId, message.path, "read"), transferId: message.transferId, itemId: message.itemId });
      const sender = new FileTransferSender({ source, send: (frame) => { if (!this.sendBinary(frame)) throw new Error("Transfer socket is unavailable"); }, onComplete: () => this.sendResult(socket, { type: "file.transfer.commit", protocolVersion: PROTOCOL_VERSION, transferId: message.transferId, itemId: message.itemId, digest: message.expectedDigest }) });
      this.transferSenders.set(transferKey(message.transferId, message.itemId), sender);
      void sender.run(message.resumeOffset).catch((error: unknown) => this.sendFileError(socket, error instanceof Error ? error.message : "Transfer failed"));
      return;
    }
    const item = { itemId: message.itemId, relativePath: message.path, type: "file" as const, sizeBytes: message.totalBytes, modifiedAt: new Date().toISOString(), digest: message.expectedDigest };
    const job = { transferId: message.transferId, sourceDeviceId: "hub", destinationDeviceId: this.options.deviceId, sourceRootId: message.rootId, sourcePath: message.path, destinationRootId: message.rootId, destinationPath: message.path, operation: "copy" as const, items: [item], totalBytes: message.totalBytes, completedBytes: 0, mode: "hub-mediated" as const, conflictPolicy: "overwrite" as const, state: "transferring" as const, retryCount: 0, checkpoints: {}, verifiedItemIds: [], manifestDigest: message.expectedDigest, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    const temporaryPath = this.fileService.resolvePath(message.rootId, `.citadela-transfers/${message.transferId}/${message.itemId}.part`, "write");
    let destinationPath = this.fileService.resolvePath(message.rootId, message.path, "write");
    const destinationExists = await lstat(destinationPath).then(() => true).catch(() => false);
    if (destinationExists && ["ask", "fail"].includes(message.conflictPolicy)) throw new FileOperationError("file.conflict", "Destination already exists");
    if (destinationExists && message.conflictPolicy === "skip") {
      this.sendResult(socket, { type: "file.operation.completed", protocolVersion: PROTOCOL_VERSION, transferId: message.transferId, itemId: message.itemId });
      return;
    }
    if (destinationExists && message.conflictPolicy === "rename") {
      const extension = message.path.includes(".") ? `.${message.path.split(".").pop()}` : "";
      const stem = extension ? message.path.slice(0, -extension.length) : message.path;
      for (let index = 1; index < 10_000; index += 1) {
        const candidate = this.fileService.resolvePath(message.rootId, `${stem} (${index})${extension}`, "write");
        if (!await lstat(candidate).then(() => true).catch(() => false)) { destinationPath = candidate; break; }
      }
    }
    const session = new FileTransferSession(job, { temporaryPath, destinationPath, replaceExisting: message.conflictPolicy === "overwrite", resumeOffset: message.resumeOffset });
    const previousSession = this.transferSessions.get(transferKey(message.transferId, message.itemId));
    if (previousSession) await previousSession.suspend();
    await session.open();
    const key = transferKey(message.transferId, message.itemId);
    this.transferSessions.set(key, session);
    const pending = this.pendingTransferFrames.get(key) ?? [];
    this.pendingTransferFrames.delete(key);
    for (const frame of pending) void this.handleTransferFrame(socket, frame);
  }

  private async executeFileOperation(operation: FileMessage extends never ? never : Extract<FileMessage, { type: "file.operation.create" }>["operation"]): Promise<void> {
    switch (operation.type) {
      case "mkdir": return this.fileService!.mkdir(operation);
      case "rename": return this.fileService!.rename(operation);
      case "delete": return this.fileService!.delete(operation);
      case "copy": return this.fileService!.copy(operation);
      case "move": return this.fileService!.move(operation);
      default: throw new FileOperationError("file.operation.failed", `Operation is not supported by the local service: ${operation.type}`);
    }
  }

  private assertDevice(deviceId: string): void {
    if (deviceId !== this.options.deviceId) throw new Error("Filesystem request targets a different device");
  }

  private sendFileError(socket: WebSocket, message: string): void {
    this.sendResult(socket, { type: "protocol.error", code: "protocol.invalid_message", message });
  }
}

function rawToBuffer(raw: Buffer | ArrayBuffer | Buffer[] | Uint8Array): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  if (Array.isArray(raw)) return Buffer.concat(raw.map((part) => Buffer.from(part)));
  return Buffer.from(raw);
}

function transferKey(transferId: string, itemId: string): string { return `${transferId}:${itemId}`; }

function isFileMessage(message: CitadelaMessage): message is FileMessage {
  return message.type.startsWith("file.");
}

function isPowerCommand(message: CitadelaMessage): message is CitadelaMessage & { id: string; deviceId: string; type: "device.system.power.sleep" | "device.system.power.restart" | "device.system.power.shutdown" } {
  return message.type === "device.system.power.sleep"
    || message.type === "device.system.power.restart"
    || message.type === "device.system.power.shutdown";
}

function powerPermission(commandType: "device.system.power.sleep" | "device.system.power.restart" | "device.system.power.shutdown"): Permission {
  return `permission.system.power.${commandType.split(".").at(-1)}` as Permission;
}

export function createConnectorConnectionId(): string {
  return randomUUID();
}

export class PairingRequiredError extends Error {
  public constructor(
    public readonly requestId: string,
    public readonly fingerprint: string,
  ) {
    super(`Connector pairing is required for identity ${fingerprint}`);
    this.name = "PairingRequiredError";
  }
}
