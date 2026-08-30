import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import {
  CitadelMessageSchema,
  DeviceHelloMessageSchema,
  PROTOCOL_VERSION,
  type NetworkMode,
  type HubHelloMessage,
} from "@citadel/protocol";
import { collectDeviceInfo } from "./system/device-info.js";

export interface ConnectorOptions {
  url: string;
  deviceId: string;
  networkMode?: NetworkMode;
  heartbeatIntervalMs?: number;
}

interface EstablishedConnection {
  socket: WebSocket;
  connectionId: string;
  networkMode: NetworkMode;
  hello: HubHelloMessage;
}

export class Connector {
  private socket: WebSocket | undefined;
  private connectionId: string | undefined;
  private networkMode: NetworkMode | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  public constructor(private readonly options: ConnectorOptions) {}

  public connect(): Promise<HubHelloMessage> {
    if (this.socket) return Promise.reject(new Error("Connector is already connected"));
    return this.establish(this.options.url, this.options.networkMode ?? "lan").then((connection) => {
      this.activate(connection);
      return connection.hello;
    });
  }

  public switchNetwork(url: string, networkMode: NetworkMode): Promise<HubHelloMessage> {
    return this.establish(url, networkMode).then((connection) => {
      const previousSocket = this.socket;
      this.stopHeartbeat();
      this.activate(connection);
      previousSocket?.close(1000, "Switched network provider");
      return connection.hello;
    });
  }

  public close(): void {
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = undefined;
    this.connectionId = undefined;
    this.networkMode = undefined;
  }

  private establish(url: string, networkMode: NetworkMode): Promise<EstablishedConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
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

        const parsed = CitadelMessageSchema.safeParse(message);
        if (!parsed.success) {
          fail(new Error("Hub sent an invalid protocol message"));
          return;
        }
        if (parsed.data.type === "protocol.error") {
          fail(new Error(parsed.data.message));
          return;
        }
        if (parsed.data.type !== "hub.hello") return;
        if (parsed.data.connectionId !== connectionId || parsed.data.networkMode !== networkMode) {
          fail(new Error("Hub handshake does not match the active connection"));
          return;
        }
        settled = true;
        resolve({ socket, connectionId, networkMode, hello: parsed.data });
      });
    });
  }

  private activate(connection: EstablishedConnection): void {
    this.socket = connection.socket;
    this.connectionId = connection.connectionId;
    this.networkMode = connection.networkMode;
    this.startHeartbeat();
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
}

export function createConnectorConnectionId(): string {
  return randomUUID();
}
