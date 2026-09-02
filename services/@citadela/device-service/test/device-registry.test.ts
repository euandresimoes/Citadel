import { describe, expect, it } from "vitest";
import { InMemoryDeviceRegistry } from "../src/devices/device-registry.js";

const identity = { algorithm: "ed25519" as const, publicKey: "public-key", fingerprint: "a".repeat(64) };

describe("device registry", () => {
  it("keeps the latest connection online and ignores stale disconnects", async () => {
    const registry = new InMemoryDeviceRegistry();
    const first = new Date("2026-01-01T00:00:00Z");
    const second = new Date("2026-01-01T00:01:00Z");
    await registry.upsertConnected("device-1", identity, "lan", "connection-1", first);
    await registry.upsertConnected("device-1", identity, "headscale", "connection-2", second);
    await registry.markDisconnected("device-1", "connection-1", new Date("2026-01-01T00:02:00Z"));
    expect((await registry.get("device-1"))?.status).toBe("online");
    expect((await registry.get("device-1"))?.connectionId).toBe("connection-2");
  });

  it("preserves system info when a device reconnects", async () => {
    const registry = new InMemoryDeviceRegistry();
    const info = { hostname: "node-1", platform: "device.platform.linux" as const, architecture: "x64", cpuCount: 4, memoryBytes: 100, uptimeSeconds: 10 };
    await registry.upsertConnected("device-1", identity, "lan", "connection-1", new Date());
    await registry.updateSystemInfo("device-1", "connection-1", info);
    await registry.upsertConnected("device-1", identity, "lan", "connection-2", new Date());
    expect((await registry.get("device-1"))?.systemInfo).toEqual(info);
  });

  it("marks records offline when the Hub starts", async () => {
    const registry = new InMemoryDeviceRegistry();
    await registry.upsertConnected("device-1", identity, "lan", "connection-1", new Date());
    await registry.markAllOffline(new Date());
    expect((await registry.get("device-1"))?.status).toBe("offline");
  });
});
