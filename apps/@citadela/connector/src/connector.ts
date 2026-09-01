import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import {
  CitadelaMessageSchema,
  DeviceHelloMessageSchema,
  PROTOCOL_VERSION,
  type CitadelaMessage,
  SystemInfoSchema,
  type NetworkMode,
  type HubHelloMessage,
} from "@citadela/protocol";
import {
  FileIdentityStore,
  loadOrCreateIdentity,
  type IdentityStore,
} from "./identity/identity.js";
import { collectDeviceInfo, collectSystemInfo } from "./system/device-info.js";
import { createPowerCommandExecutor, type PowerCommandExecutor, type PowerCommandType } from "./power/index.js";

export interface ConnectorOptions {
  url: string;
  deviceId: string;
  networkMode?: NetworkMode;
  heartbeatIntervalMs?: number;
  identityStore?: IdentityStore;
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
  powerExecutor?: PowerCommandExecutor;
  processedCommandLimit?: number;
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
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnectDelayMs: number | undefined;
  private stopped = true;
  private readonly identity;
  private readonly powerExecutor: PowerCommandExecutor;
  private readonly processedCommandIds = new Set<string>();
  private readonly inFlightCommandIds = new Set<string>();

  public constructor(private readonly options: ConnectorOptions) {
    const store = options.identityStore ?? new FileIdentityStore(join(homedir(), ".citadela", "identity.json"));
    this.identity = loadOrCreateIdentity(store);
    this.powerExecutor = options.powerExecutor ?? createPowerCommandExecutor();
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
          device: collectDeviceInfo(),
        })));
      });

      socket.on("message", (raw) => {
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
        if (parsed.data.type === "device.system.info.request") {
          if (!settled) return;
          if (parsed.data.deviceId !== this.options.deviceId) return;
          this.sendCommandResult(socket, parsed.data.id, async () => SystemInfoSchema.parse(collectSystemInfo()));
          return;
        }
        if (isPowerCommand(parsed.data)) {
          if (!settled) return;
          if (parsed.data.deviceId !== this.options.deviceId) return;
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
    connection.socket.on("close", () => {
      if (this.socket !== connection.socket || this.stopped) return;
      this.stopHeartbeat();
      this.socket = undefined;
      this.connectionId = undefined;
      this.networkMode = undefined;
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
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      this.socket.send(
        JSON.stringify({
          type: "device.heartbeat",
          deviceId: this.options.deviceId,
          connectionId: this.connectionId,
          timestamp: Date.now(),
        }),
      );
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
}

function isPowerCommand(message: CitadelaMessage): message is CitadelaMessage & { id: string; deviceId: string; type: "device.system.power.sleep" | "device.system.power.restart" | "device.system.power.shutdown" } {
  return message.type === "device.system.power.sleep"
    || message.type === "device.system.power.restart"
    || message.type === "device.system.power.shutdown";
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
