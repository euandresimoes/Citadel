import { describe, expect, it } from "vitest";
import { Connector } from "../../../../apps/@citadel/connector/src/index.js";
import { RealtimeService } from "../src/index.js";

describe("RealtimeService", () => {
  it("completes a real Connector handshake and creates a session", async () => {
    const service = new RealtimeService({ port: 0 });
    await service.ready();

    const connector = new Connector({
      url: `ws://127.0.0.1:${service.port()}`,
      deviceId: "device-e2e",
      heartbeatIntervalMs: 10,
    });
    const response = await connector.connect();

    expect(response.type).toBe("hub.hello");
    expect(response.deviceId).toBe("device-e2e");
    expect(service.getSession("device-e2e")?.sessionId).toBe(response.sessionId);
    expect(service.getSession("device-e2e")?.networkMode).toBe("lan");
    expect(service.getSession("device-e2e")?.lastHeartbeat).toBeInstanceOf(Date);

    connector.close();
    await service.close();
  });

  it("performs a controlled handoff between network modes", async () => {
    const service = new RealtimeService({ port: 0 });
    await service.ready();
    const connector = new Connector({
      url: `ws://127.0.0.1:${service.port()}`,
      deviceId: "device-handoff",
      networkMode: "lan",
    });

    const first = await connector.connect();
    const second = await connector.switchNetwork(
      `ws://127.0.0.1:${service.port()}`,
      "headscale",
    );

    expect(first.networkMode).toBe("lan");
    expect(second.networkMode).toBe("headscale");
    expect(second.connectionId).not.toBe(first.connectionId);
    expect(service.getSession("device-handoff")?.networkMode).toBe("headscale");
    expect(service.getSession("device-handoff")?.connectionId).toBe(second.connectionId);

    connector.close();
    await service.close();
  });
});
