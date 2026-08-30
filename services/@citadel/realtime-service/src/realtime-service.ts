import { randomUUID } from "node:crypto";
import {
  CitadelMessageSchema,
  PROTOCOL_VERSION,
  type DeviceHelloMessage,
  type NetworkMode,
} from "@citadel/protocol";
import { WebSocketServer, type WebSocket } from "ws";

export interface RealtimeServiceOptions {
  host?: string;
  port: number;
}

export interface DeviceSession {
  deviceId: string;
  connectionId: string;
  networkMode: NetworkMode;
  sessionId: string;
  connectedAt: Date;
  lastHeartbeat: Date;
  socket: WebSocket;
}

export class RealtimeService {
  private readonly server: WebSocketServer;
  private readonly sessions = new Map<string, DeviceSession>();

  public constructor(options: RealtimeServiceOptions) {
    this.server = new WebSocketServer({
      host: options.host ?? "127.0.0.1",
      port: options.port,
    });
    this.server.on("connection", (socket) => this.handleConnection(socket));
  }

  public async ready(): Promise<void> {
    if (this.server.address()) return;
    await new Promise<void>((resolve, reject) => {
      const onListening = (): void => {
        this.server.off("error", onError);
        resolve();
      };
      const onError = (error: Error): void => {
        this.server.off("listening", onListening);
        reject(error);
      };
      this.server.once("listening", onListening);
      this.server.once("error", onError);
    });
  }

  public port(): number {
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Service is not listening");
    return address.port;
  }

  public getSession(deviceId: string): DeviceSession | undefined {
    return this.sessions.get(deviceId);
  }

  public async close(): Promise<void> {
    for (const session of this.sessions.values()) session.socket.close();
    this.sessions.clear();
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private handleConnection(socket: WebSocket): void {
    let handshaken = false;
    const handshakeTimeout = setTimeout(() => {
      if (!handshaken) socket.close(1008, "Handshake timeout");
    }, 5_000);

    socket.on("message", (raw) => {
      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        this.sendError(socket, "protocol.invalid_message", "Message is not valid JSON");
        return;
      }

      const parsed = CitadelMessageSchema.safeParse(message);
      if (!parsed.success) {
        this.sendError(socket, "protocol.invalid_message", "Message does not match the Citadel protocol");
        return;
      }

      if (!handshaken) {
        if (parsed.data.type !== "device.hello") {
          this.sendError(socket, "protocol.invalid_message", "The first message must be device.hello");
          socket.close(1002, "Handshake required");
          return;
        }
        this.acceptDevice(socket, parsed.data);
        handshaken = true;
        clearTimeout(handshakeTimeout);
        return;
      }

      if (parsed.data.type === "device.heartbeat") {
        const session = this.sessions.get(parsed.data.deviceId);
        if (session?.socket === socket && session.connectionId === parsed.data.connectionId) {
          session.lastHeartbeat = new Date(parsed.data.timestamp);
        }
      }
    });

    socket.on("close", () => {
      clearTimeout(handshakeTimeout);
      for (const [deviceId, session] of this.sessions) {
        if (session.socket === socket) this.sessions.delete(deviceId);
      }
    });
  }

  private acceptDevice(socket: WebSocket, hello: DeviceHelloMessage): void {
    if (hello.protocolVersion !== PROTOCOL_VERSION) {
      this.sendError(socket, "protocol.unsupported_version", "Unsupported protocol version");
      socket.close(1002, "Unsupported protocol version");
      return;
    }

    const previousSession = this.sessions.get(hello.deviceId);
    const session: DeviceSession = {
      deviceId: hello.deviceId,
      connectionId: hello.connectionId,
      networkMode: hello.networkMode,
      sessionId: randomUUID(),
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      socket,
    };
    this.sessions.set(hello.deviceId, session);
    socket.send(JSON.stringify({
      type: "hub.hello",
      deviceId: hello.deviceId,
      connectionId: hello.connectionId,
      networkMode: hello.networkMode,
      protocolVersion: PROTOCOL_VERSION,
      sessionId: session.sessionId,
    }));
    previousSession?.socket.close(1000, "Replaced by a newer network connection");
  }

  private sendError(socket: WebSocket, code: "protocol.invalid_message" | "protocol.unsupported_version" | "protocol.unauthorized", message: string): void {
    socket.send(JSON.stringify({ type: "protocol.error", code, message }));
  }
}
