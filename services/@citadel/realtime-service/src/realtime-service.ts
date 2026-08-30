import { createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import {
  CitadelMessageSchema,
  PROTOCOL_VERSION,
  type DeviceAuthMessage,
  type DeviceHelloMessage,
  type NetworkMode,
} from "@citadel/protocol";
import type { PairingAuthorizer } from "@citadel/device-service";
import { WebSocketServer, type WebSocket } from "ws";

export interface RealtimeServiceOptions {
  host?: string;
  port: number;
  pairing: PairingAuthorizer;
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
    this.pairing = options.pairing;
    this.server = new WebSocketServer({
      host: options.host ?? "127.0.0.1",
      port: options.port,
    });
    this.server.on("connection", (socket) => this.handleConnection(socket));
  }

  private readonly pairing: PairingAuthorizer;

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
    let authenticated = false;
    let pendingAuthentication: { hello: DeviceHelloMessage; nonce: string } | undefined;
    const handshakeTimeout = setTimeout(() => {
      if (!handshaken) socket.close(1008, "Handshake timeout");
    }, 5_000);

    socket.on("message", async (raw) => {
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
        pendingAuthentication = await this.beginAuthentication(socket, parsed.data);
        if (pendingAuthentication) {
          handshaken = true;
          clearTimeout(handshakeTimeout);
        }
        return;
      }

      if (!authenticated) {
        if (parsed.data.type !== "device.auth" || !pendingAuthentication) {
          this.sendError(socket, "protocol.unauthorized", "Device authentication is required");
          socket.close(1008, "Authentication required");
          return;
        }
        if (!this.verifyAuthentication(parsed.data, pendingAuthentication.nonce, pendingAuthentication.hello)) {
          this.sendError(socket, "protocol.unauthorized", "Invalid device signature");
          socket.close(1008, "Invalid device signature");
          return;
        }
        authenticated = true;
        this.activateDevice(socket, pendingAuthentication.hello);
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

  private async beginAuthentication(socket: WebSocket, hello: DeviceHelloMessage): Promise<{ hello: DeviceHelloMessage; nonce: string } | undefined> {
    if (hello.protocolVersion !== PROTOCOL_VERSION) {
      this.sendError(socket, "protocol.unsupported_version", "Unsupported protocol version");
      socket.close(1002, "Unsupported protocol version");
      return undefined;
    }

    if (!(await this.pairing.authorize(hello.deviceId, hello.identity))) {
      const request = await this.pairing.requestPairing(hello.deviceId, hello.identity);
      socket.send(JSON.stringify({
        type: "pairing.pending",
        requestId: request.requestId,
        deviceId: request.deviceId,
        identity: request.identity,
      }));
      socket.close(1008, "Pairing required");
      return undefined;
    }

    const nonce = randomBytes(32).toString("base64url");
    socket.send(JSON.stringify({ type: "hub.challenge", connectionId: hello.connectionId, nonce }));
    return { hello, nonce };
  }

  private verifyAuthentication(
    auth: DeviceAuthMessage,
    nonce: string,
    hello: DeviceHelloMessage,
  ): boolean {
    if (auth.connectionId !== hello.connectionId) return false;
    try {
      const publicKey = createPublicKey({
        key: Buffer.from(hello.identity.publicKey, "base64"),
        format: "der",
        type: "spki",
      });
      return verify(null, Buffer.from(nonce, "base64url"), publicKey, Buffer.from(auth.signature, "base64"));
    } catch {
      return false;
    }
  }

  private activateDevice(socket: WebSocket, hello: DeviceHelloMessage): void {

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
