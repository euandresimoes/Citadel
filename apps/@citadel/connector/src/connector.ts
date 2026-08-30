import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import {
  CitadelMessageSchema,
  DeviceHelloMessageSchema,
  PROTOCOL_VERSION,
  type HubHelloMessage,
} from "@citadel/protocol";
import { collectDeviceInfo } from "./system/device-info.js";

export interface ConnectorOptions {
  url: string;
  deviceId: string;
  heartbeatIntervalMs?: number;
}

export class Connector {
  private socket: WebSocket | undefined;
  private heartbeatTimer?: NodeJS.Timeout;

  public constructor(private readonly options: ConnectorOptions) {}

  public connect(): Promise<HubHelloMessage> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.options.url);
      this.socket = socket;

      socket.once("error", reject);
      socket.once("open", () => {
        socket.send(
          JSON.stringify(
            DeviceHelloMessageSchema.parse({
              type: "device.hello",
              deviceId: this.options.deviceId,
              protocolVersion: PROTOCOL_VERSION,
              device: collectDeviceInfo(),
            }),
          ),
        );
      });

      socket.on("message", (raw) => {
        let message: unknown;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          reject(new Error("Hub sent invalid JSON"));
          socket.close(1002, "Invalid JSON");
          return;
        }

        const parsed = CitadelMessageSchema.safeParse(message);
        if (!parsed.success) {
          reject(new Error("Hub sent an invalid protocol message"));
          socket.close(1002, "Invalid protocol message");
          return;
        }

        if (parsed.data.type === "protocol.error") {
          reject(new Error(parsed.data.message));
          socket.close(1008, parsed.data.code);
          return;
        }

        if (parsed.data.type !== "hub.hello") return;

        this.startHeartbeat();
        resolve(parsed.data);
      });
    });
  }

  public close(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.socket?.close();
    this.socket = undefined;
  }

  private startHeartbeat(): void {
    const interval = this.options.heartbeatIntervalMs ?? 30_000;
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      this.socket.send(
        JSON.stringify({
          type: "device.heartbeat",
          deviceId: this.options.deviceId,
          timestamp: Date.now(),
        }),
      );
    }, interval);
  }
}

export function createConnectorSessionId(): string {
  return randomUUID();
}
