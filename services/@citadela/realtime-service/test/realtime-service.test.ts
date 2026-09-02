import { describe, expect, it } from "vitest";
import { Connector, MemoryIdentityStore, PairingRequiredError, loadOrCreateIdentity, type PowerCommandExecutor } from "../../../../apps/@citadela/connector/src/index.js";
import { InMemoryPairingService } from "@citadela/device-service";
import { RealtimeService } from "../src/index.js";
import type { CommandResult } from "@citadela/protocol";

describe("RealtimeService", () => {
  it("authenticates a Connector and executes a real system info command", async () => {
    const pairing = new InMemoryPairingService();
    const identityStore = new MemoryIdentityStore();
    const identity = loadOrCreateIdentity(identityStore).identity;
    let resolveResult: ((result: CommandResult) => void) | undefined;
    let expectedCommandId = "command-info-01";
    const resultPromise = new Promise<CommandResult>((resolve) => { resolveResult = resolve; });
    const powerExecutor: PowerCommandExecutor = { execute: async () => undefined };
    const service = new RealtimeService({
      port: 0,
      pairing,
      onMessage: (_deviceId, message) => {
        if (message.type === "command.result" && message.commandId === expectedCommandId) resolveResult?.(message);
      },
    });
    await service.ready();
    const connector = new Connector({
      url: `ws://127.0.0.1:${service.port()}`,
      deviceId: "device-e2e",
      heartbeatIntervalMs: 10,
      identityStore,
      powerExecutor,
    });

    await expect(connector.connect()).rejects.toBeInstanceOf(PairingRequiredError);
    const request = (await pairing.listPending())[0];
    if (!request) throw new Error("Pairing request was not created");
    await pairing.approve(request.requestId);
    const response = await connector.connect();
    expect(response.type).toBe("hub.hello");

    expect(service.sendCommand("device-e2e", {
      id: "command-info-01",
      type: "device.system.info.request",
      deviceId: "device-e2e",
    })).toBe(true);
    const commandResult = await resultPromise;
    expect(commandResult.success).toBe(true);
    expect(commandResult.commandId).toBe("command-info-01");
    expect(commandResult.data).toMatchObject({ hostname: expect.any(String) });
    await expect.poll(() => service.getSession("device-e2e")?.systemInfo).toMatchObject({ hostname: expect.any(String) });

    const powerResultPromise = new Promise<CommandResult>((resolve) => { resolveResult = resolve; });
    expectedCommandId = "command-restart-01";
    expect(service.sendCommand("device-e2e", {
      id: "command-restart-01",
      type: "device.system.power.restart",
      deviceId: "device-e2e",
    })).toBe(true);
    await expect(powerResultPromise).resolves.toMatchObject({ commandId: "command-restart-01", success: true });

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
    const second = await connector.switchNetwork(`ws://127.0.0.1:${service.port()}`, "headscale");
    expect(first.networkMode).toBe("lan");
    expect(second.networkMode).toBe("headscale");
    expect(second.connectionId).not.toBe(first.connectionId);
    expect(service.getSession("device-handoff")?.networkMode).toBe("headscale");
    expect(service.getSession("device-handoff")?.connectionId).toBe(second.connectionId);

    connector.close();
    await service.close();
  });

  it("exposes connection lifecycle events and active sessions", async () => {
    const pairing = new InMemoryPairingService();
    const identityStore = new MemoryIdentityStore();
    const identity = loadOrCreateIdentity(identityStore).identity;
    const request = await pairing.requestPairing("device-events", identity);
    await pairing.approve(request.requestId);
    const events: string[] = [];
    const service = new RealtimeService({ port: 0, pairing, onSessionEvent: (event) => events.push(event.type) });
    await service.ready();
    const connector = new Connector({ url: `ws://127.0.0.1:${service.port()}`, deviceId: "device-events", identityStore });
    await connector.connect();
    expect(service.listSessions()).toHaveLength(1);
    expect(events).toContain("device.connected");

    connector.close();
    await expect.poll(() => events, { timeout: 2_000 }).toContain("device.disconnected");
    expect(service.listSessions()).toHaveLength(0);
    await service.close();
  });
});
