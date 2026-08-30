import { describe, expect, it } from "vitest";
import { Connector, MemoryIdentityStore, type PowerCommandExecutor } from "@citadel/connector";
import { InMemoryPairingService } from "@citadel/device-service";
import { RealtimeService } from "@citadel/realtime-service";
import type { CitadelMessage } from "@citadel/protocol";
import { HubCommandService, InMemoryCommandRepository, type CommandAuthorizer, type CommandTransport } from "../src/index.js";

describe("HubCommandService", () => {
  it("requires explicit confirmation before dispatching power commands", async () => {
    const sent: unknown[] = [];
    const transport: CommandTransport = { sendCommand: (_deviceId, command) => { sent.push(command); return true; } };
    const authorizer: CommandAuthorizer = { authorize: async () => true };
    const service = new HubCommandService(transport, authorizer);

    const requested = await service.request("user-1", {
      type: "device.system.power.shutdown",
      deviceId: "device-1",
    });
    expect(requested.state).toBe("awaiting_confirmation");
    expect(sent).toHaveLength(0);

    const confirmed = await service.confirm("user-1", requested.command.id);
    expect(confirmed.state).toBe("dispatched");
    expect(sent).toHaveLength(1);
  });

  it("rejects confirmation by a different actor", async () => {
    const service = new HubCommandService(
      { sendCommand: () => true },
      { authorize: async () => true },
    );
    const requested = await service.request("user-1", { type: "device.system.power.restart", deviceId: "device-1" });
    await expect(service.confirm("user-2", requested.command.id)).rejects.toThrow("not authorized");
  });

  it("moves a dispatched command to a terminal result state only for its device", async () => {
    const repository = new InMemoryCommandRepository();
    const service = new HubCommandService({ sendCommand: () => true }, { authorize: async () => true }, repository);
    const requested = await service.request("user-1", { type: "device.system.power.sleep", deviceId: "device-1" });
    await service.confirm("user-1", requested.command.id);

    await expect(service.handleResult("device-2", { type: "command.result", commandId: requested.command.id, success: true }))
      .resolves.toBeUndefined();
    await expect(service.handleResult("device-1", { type: "command.result", commandId: requested.command.id, success: false, error: "permission denied" }))
      .resolves.toMatchObject({ state: "failed", error: "permission denied" });
  });

  it("dispatches a confirmed command through Realtime to an authenticated Connector", async () => {
    const pairing = new InMemoryPairingService();
    let hub: HubCommandService | undefined;
    const realtime = new RealtimeService({
      port: 0,
      pairing,
      onMessage: (deviceId, message: CitadelMessage) => {
        if (message.type === "command.result") void hub?.handleResult(deviceId, message);
      },
    });
    await realtime.ready();
    hub = new HubCommandService(realtime, { authorize: async () => true });
    const identityStore = new MemoryIdentityStore();
    const powerExecutor: PowerCommandExecutor = { execute: async () => undefined };
    const connector = new Connector({
      url: `ws://127.0.0.1:${realtime.port()}`,
      deviceId: "device-e2e",
      identityStore,
      powerExecutor,
    });

    await expect(connector.connect()).rejects.toThrow("pairing is required");
    const pending = (await pairing.listPending())[0];
    if (!pending) throw new Error("Pairing request was not created");
    await pairing.approve(pending.requestId);
    await connector.connect();

    const requested = await hub.request("user-1", { type: "device.system.power.restart", deviceId: "device-e2e" });
    expect(requested.state).toBe("awaiting_confirmation");
    await hub.confirm("user-1", requested.command.id);
    await expect.poll(async () => (await hub?.get(requested.command.id))?.state, { timeout: 2_000 }).toBe("succeeded");

    connector.close();
    await realtime.close();
  });
});
