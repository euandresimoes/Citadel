import { describe, expect, it } from "vitest";
import { Connector, MemoryIdentityStore, PairingRequiredError, loadOrCreateIdentity, type PowerCommandExecutor } from "../../../../apps/@citadela/connector/src/index.js";
import { InMemoryPairingService } from "@citadela/device-service";
import { RealtimeService } from "../src/index.js";
import type { CommandResult } from "@citadela/protocol";
import { createHash } from "node:crypto";
import { encodeFileTransferFrame } from "../../../../apps/@citadela/connector/src/filesystem/transfer-frame.js";

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

  it("transports authenticated binary frames without parsing them as protocol JSON", async () => {
    const pairing = new InMemoryPairingService();
    const identityStore = new MemoryIdentityStore();
    const identity = loadOrCreateIdentity(identityStore).identity;
    const request = await pairing.requestPairing("device-binary", identity);
    await pairing.approve(request.requestId);
    let service: RealtimeService;
    let connector: Connector;
    let resolveByHub: (payload: Buffer) => void = () => undefined;
    const receivedByHub = new Promise<Buffer>((resolve) => { resolveByHub = resolve; });
    service = new RealtimeService({ port: 0, pairing, onBinaryMessage: (_deviceId, payload) => resolveByHub(payload) });
    await service!.ready();
    connector = new Connector({ url: `ws://127.0.0.1:${service!.port()}`, deviceId: "device-binary", identityStore, onBinaryMessage: (payload) => expect(payload).toEqual(Buffer.from([4, 5, 6])) });
    await connector.connect();
    expect(service!.sendBinary("device-binary", Buffer.from([4, 5, 6]))).toBe(true);
    expect(connector.sendBinary(Buffer.from([7, 8, 9]))).toBe(true);
    await expect(receivedByHub).resolves.toEqual(Buffer.from([7, 8, 9]));
    connector.close();
    await service!.close();
  });

  it("relays a transfer frame only from the registered source to its destination", async () => {
    const pairing = new InMemoryPairingService();
    const sourceStore = new MemoryIdentityStore();
    const destinationStore = new MemoryIdentityStore();
    for (const [deviceId, store] of [["source", sourceStore], ["destination", destinationStore]] as const) {
      const request = await pairing.requestPairing(deviceId, loadOrCreateIdentity(store).identity);
      await pairing.approve(request.requestId);
    }
    let received: Buffer | undefined;
    const service = new RealtimeService({ port: 0, pairing });
    await service.ready();
    const source = new Connector({ url: `ws://127.0.0.1:${service.port()}`, deviceId: "source", identityStore: sourceStore });
    const destination = new Connector({ url: `ws://127.0.0.1:${service.port()}`, deviceId: "destination", identityStore: destinationStore, onBinaryMessage: (payload) => { received = payload; } });
    await source.connect();
    await destination.connect();
    service.registerBinaryRoute("transfer-route", "source", "destination");
    const payload = Buffer.from("relay");
    const frame = encodeFileTransferFrame({ transferId: "transfer-route", itemId: "item", sequence: 0, offsetBytes: 0, byteLength: payload.length, digest: createHash("sha256").update(payload).digest("hex") }, payload);
    expect(source.sendBinary(frame)).toBe(true);
    await expect.poll(() => received).toEqual(frame);
    service.unregisterBinaryRoute("transfer-route");
    source.close();
    destination.close();
    await service.close();
  });
});
