import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { Connector, MemoryIdentityStore, type PowerCommandExecutor } from "../src/index.js";

describe("Connector handshake", () => {
  it("collects real host metadata and completes a WebSocket handshake", async () => {
    const server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");

    server.on("connection", (socket) => {
      socket.once("message", (raw) => {
        const hello = JSON.parse(raw.toString()) as { deviceId: string; connectionId: string; networkMode: string; device: { hostname: string } };
        expect(hello.deviceId).toBe("device-test");
        expect(hello.connectionId.length).toBeGreaterThan(0);
        expect(hello.networkMode).toBe("lan");
        expect(hello.device.hostname.length).toBeGreaterThan(0);
        socket.send(JSON.stringify({
          type: "hub.hello",
          deviceId: hello.deviceId,
          connectionId: hello.connectionId,
          networkMode: hello.networkMode,
          protocolVersion: 1,
          sessionId: "session-test",
        }));
      });
    });

    const connector = new Connector({
      url: `ws://127.0.0.1:${address.port}`,
      deviceId: "device-test",
      heartbeatIntervalMs: 10,
      identityStore: new MemoryIdentityStore(),
    });
    const handshake = await connector.connect();

    expect(handshake.type).toBe("hub.hello");
    expect(handshake.sessionId).toBe("session-test");

    connector.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("reconnects with backoff after an established connection drops", async () => {
    const server = new WebSocketServer({ port: 0 });
    let connections = 0;
    server.on("connection", (socket) => {
      connections += 1;
      socket.once("message", (raw) => {
        const hello = JSON.parse(raw.toString()) as { deviceId: string; connectionId: string; networkMode: string };
        socket.send(JSON.stringify({
          type: "hub.hello",
          deviceId: hello.deviceId,
          connectionId: hello.connectionId,
          networkMode: hello.networkMode,
          protocolVersion: 1,
          sessionId: `session-${connections}`,
        }));
        if (connections === 1) setTimeout(() => socket.close(), 25);
      });
    });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");

    const connector = new Connector({
      url: `ws://127.0.0.1:${address.port}`,
      deviceId: "device-reconnect",
      reconnectInitialDelayMs: 10,
      identityStore: new MemoryIdentityStore(),
    });
    await connector.connect();
    await expect.poll(() => connections, { timeout: 2_000 }).toBeGreaterThanOrEqual(2);

    connector.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 5_000);

  it("executes authenticated power commands and rejects command replay", async () => {
    const server = new WebSocketServer({ port: 0 });
    let serverSocket: import("ws").WebSocket | undefined;
    server.on("connection", (socket) => {
      serverSocket = socket;
      socket.once("message", (raw) => {
        const hello = JSON.parse(raw.toString()) as { deviceId: string; connectionId: string; networkMode: string };
        socket.send(JSON.stringify({
          type: "hub.hello",
          deviceId: hello.deviceId,
          connectionId: hello.connectionId,
          networkMode: hello.networkMode,
          protocolVersion: 1,
          sessionId: "session-power",
        }));
      });
    });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");

    const executed: string[] = [];
    const powerExecutor: PowerCommandExecutor = {
      execute: async (commandType) => { executed.push(commandType); },
    };
    const connector = new Connector({
      url: `ws://127.0.0.1:${address.port}`,
      deviceId: "device-power",
      identityStore: new MemoryIdentityStore(),
      powerExecutor,
    });
    await connector.connect();

    const resultPromise = new Promise<Record<string, unknown>>((resolve) => {
      serverSocket?.on("message", (raw) => {
        const message = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (message.type === "command.result") resolve(message);
      });
    });
    const command = {
      type: "device.system.power.restart",
      id: "power-command-01",
      deviceId: "device-power",
    };
    serverSocket?.send(JSON.stringify(command));
    await expect(resultPromise).resolves.toMatchObject({ commandId: command.id, success: true });
    expect(executed).toEqual([command.type]);

    const replayPromise = new Promise<Record<string, unknown>>((resolve) => {
      serverSocket?.once("message", (raw) => resolve(JSON.parse(raw.toString()) as Record<string, unknown>));
    });
    serverSocket?.send(JSON.stringify(command));
    await expect(replayPromise).resolves.toMatchObject({ commandId: command.id, success: false });
    expect(executed).toEqual([command.type]);

    connector.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
