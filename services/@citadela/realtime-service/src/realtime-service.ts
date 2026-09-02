import { createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import { createServer as createHttpsServer } from "node:https";
import type { Server } from "node:https";
import {
  CitadelaMessageSchema,
  PROTOCOL_VERSION,
  type DeviceAuthMessage,
  type CitadelaMessage,
  type DeviceHelloMessage,
  type Command,
  type NetworkMode,
  SystemInfoSchema,
  type SystemInfo,
} from "@citadela/protocol";
import type { PairingAuthorizer } from "@citadela/device-service";
import type { DeviceRegistry } from "@citadela/device-service";
import WebSocket, { WebSocketServer, type WebSocket as WebSocketConnection } from "ws";

export interface RealtimeServiceOptions {
  host?: string;
  port: number;
  pairing: PairingAuthorizer;
  tls?: { key: string | Buffer; cert: string | Buffer };
  onMessage?: (deviceId: string, message: CitadelaMessage) => void;
  onSessionEvent?: SessionEventListener;
  deviceRegistry?: DeviceRegistry;
}

export interface DeviceSession {
  deviceId: string;
  connectionId: string;
  networkMode: NetworkMode;
  sessionId: string;
  connectedAt: Date;
  lastHeartbeat: Date;
  socket: WebSocketConnection;
  systemInfo?: SystemInfo;
}

export type SessionEvent =
  | { type: "device.connected"; session: DeviceSession }
  | { type: "device.disconnected"; deviceId: string; connectionId: string };

export type SessionEventListener = (event: SessionEvent) => void;

export class RealtimeService {
  private readonly server: WebSocketServer;
  private readonly listener: Server | undefined;
  private readonly sessions = new Map<string, DeviceSession>();
  private readonly sessionEventListeners = new Set<SessionEventListener>();
  private readonly pairing: PairingAuthorizer;
  private readonly onMessage: RealtimeServiceOptions["onMessage"];
  private readonly onSessionEvent: RealtimeServiceOptions["onSessionEvent"];
  private readonly deviceRegistry: DeviceRegistry | undefined;

  public constructor(options: RealtimeServiceOptions) {
    this.pairing = options.pairing;
    this.onMessage = options.onMessage;
    this.onSessionEvent = options.onSessionEvent;
    this.deviceRegistry = options.deviceRegistry;
    if (options.tls) {
      this.listener = createHttpsServer(options.tls);
      this.server = new WebSocketServer({ server: this.listener });
      this.listener.listen(options.port, options.host ?? "127.0.0.1");
    } else {
      this.listener = undefined;
      this.server = new WebSocketServer({ host: options.host ?? "127.0.0.1", port: options.port });
    }
    this.server.on("connection", (socket) => this.handleConnection(socket));
  }

  public async ready(): Promise<void> {
    if (this.listener) {
      if (this.listener.listening) return;
      await new Promise<void>((resolve, reject) => {
        this.listener?.once("listening", resolve);
        this.listener?.once("error", reject);
      });
      return;
    }
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
    const address = this.listener ? this.listener.address() : this.server.address();
    if (!address || typeof address === "string") throw new Error("Service is not listening");
    return address.port;
  }

  public getSession(deviceId: string): DeviceSession | undefined {
    return this.sessions.get(deviceId);
  }

  public listSessions(): DeviceSession[] {
    return [...this.sessions.values()];
  }

  public subscribeSessionEvents(listener: SessionEventListener): () => void {
    this.sessionEventListeners.add(listener);
    return () => this.sessionEventListeners.delete(listener);
  }

  public sendCommand(deviceId: string, command: Command): boolean {
    const session = this.sessions.get(deviceId);
    if (!session || session.socket.readyState !== WebSocket.OPEN) return false;
    session.socket.send(JSON.stringify(command));
    return true;
  }

  public requestSystemInfo(deviceId: string): boolean {
    return this.sendCommand(deviceId, { id: randomUUID(), type: "device.system.info.request", deviceId });
  }

  public async close(): Promise<void> {
    const closedAt = new Date();
    await Promise.all([...this.sessions.values()].map((session) => this.deviceRegistry?.markDisconnected(session.deviceId, session.connectionId, closedAt)));
    for (const session of this.sessions.values()) session.socket.close();
    this.sessions.clear();
    await new Promise<void>((resolve, reject) => {
      const close = this.listener ?? this.server;
      close.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private handleConnection(socket: WebSocketConnection): void {
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

      const parsed = CitadelaMessageSchema.safeParse(message);
      if (!parsed.success) {
        this.sendError(socket, "protocol.invalid_message", "Message does not match the Citadela protocol");
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
          void this.deviceRegistry?.updateHeartbeat(parsed.data.deviceId, parsed.data.connectionId, session.lastHeartbeat);
        }
      }
      const activeSession = [...this.sessions.values()].find((session) => session.socket === socket);
      if (activeSession && parsed.data.type === "command.result" && parsed.data.success) {
        const systemInfo = SystemInfoSchema.safeParse(parsed.data.data);
        if (systemInfo.success) {
          activeSession.systemInfo = systemInfo.data;
          void this.deviceRegistry?.updateSystemInfo(activeSession.deviceId, activeSession.connectionId, systemInfo.data);
        }
      }
      if (activeSession) this.onMessage?.(activeSession.deviceId, parsed.data);
    });

    socket.on("close", () => {
      clearTimeout(handshakeTimeout);
      for (const [deviceId, session] of this.sessions) {
        if (session.socket === socket) {
          this.sessions.delete(deviceId);
          void this.deviceRegistry?.markDisconnected(deviceId, session.connectionId, new Date());
          this.emitSessionEvent({ type: "device.disconnected", deviceId, connectionId: session.connectionId });
        }
      }
    });
  }

  private async beginAuthentication(socket: WebSocketConnection, hello: DeviceHelloMessage): Promise<{ hello: DeviceHelloMessage; nonce: string } | undefined> {
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

  private activateDevice(socket: WebSocketConnection, hello: DeviceHelloMessage): void {

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
    void this.deviceRegistry?.upsertConnected(hello.deviceId, hello.identity, hello.networkMode, hello.connectionId, session.connectedAt);
    this.emitSessionEvent({ type: "device.connected", session });
    socket.send(JSON.stringify({
      type: "hub.hello",
      deviceId: hello.deviceId,
      connectionId: hello.connectionId,
      networkMode: hello.networkMode,
      protocolVersion: PROTOCOL_VERSION,
      sessionId: session.sessionId,
    }));
    this.requestSystemInfo(hello.deviceId);
    previousSession?.socket.close(1000, "Replaced by a newer network connection");
  }

  private sendError(socket: WebSocketConnection, code: "protocol.invalid_message" | "protocol.unsupported_version" | "protocol.unauthorized", message: string): void {
    socket.send(JSON.stringify({ type: "protocol.error", code, message }));
  }

  private emitSessionEvent(event: SessionEvent): void {
    this.onSessionEvent?.(event);
    for (const listener of this.sessionEventListeners) listener(event);
  }
}
