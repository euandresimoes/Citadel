import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { Connector } from "../src/index.js";
import { MemoryIdentityStore } from "../src/index.js";

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
});
