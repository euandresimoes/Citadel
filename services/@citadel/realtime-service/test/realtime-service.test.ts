import { describe, expect, it } from "vitest";
import { Connector, MemoryIdentityStore, PairingRequiredError, loadOrCreateIdentity } from "../../../../apps/@citadel/connector/src/index.js";
import { InMemoryPairingService } from "@citadel/device-service";
import { RealtimeService } from "../src/index.js";

describe("RealtimeService", () => {
  it("completes a real Connector handshake and creates a session", async () => {
    const pairing = new InMemoryPairingService();
    const identityStore = new MemoryIdentityStore();
    const identity = loadOrCreateIdentity(identityStore).identity;
    const service = new RealtimeService({ port: 0, pairing });
    await service.ready();

    const connector = new Connector({
      url: `ws://127.0.0.1:${service.port()}`,
      deviceId: "device-e2e",
      heartbeatIntervalMs: 10,
      identityStore,
    });
    await expect(connector.connect()).rejects.toBeInstanceOf(PairingRequiredError);
    const request = (await pairing.listPending())[0];
    if (!request) throw new Error("Pairing request was not created");
    await pairing.approve(request.requestId);
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
    const pairing = new InMemoryPairingService();
    const identityStore = new MemoryIdentityStore();
    const identity = loadOrCreateIdentity(identityStore).identity;
    const request = await pairing.requestPairing("device-handoff", identity);
    await pairing.approve(request.requestId);
    const service = new RealtimeService({ port: 0, pairing });
    await service.ready();
    const connector = new Connector({
      url: `ws://127.0.0.1:${service.port()}`,
      deviceId: "device-handoff",
      networkMode: "lan",
      identityStore,
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
