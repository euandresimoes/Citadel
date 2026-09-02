import { describe, expect, it } from "vitest";
import { NetworkProviderManager } from "../src/network/provider-manager.js";

describe("NetworkProviderManager", () => {
  it("keeps LAN and Headscale providers independently configurable", async () => {
    const manager = new NetworkProviderManager();
    await manager.configure({ mode: "headscale", enabled: true, controlPlaneUrl: "https://headscale.example" });
    expect(await manager.list()).toEqual(expect.arrayContaining([{ mode: "lan", enabled: true }, { mode: "headscale", enabled: true, controlPlaneUrl: "https://headscale.example" }]));
  });
  it("requires a Headscale target when enabling it", async () => {
    await expect(new NetworkProviderManager().configure({ mode: "headscale", enabled: true })).rejects.toThrow();
  });
});
