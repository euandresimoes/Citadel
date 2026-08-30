import { describe, expect, it } from "vitest";
import { HeadscaleProvider, LanProvider, NetworkModeSchema } from "../src/index.js";

describe("network providers", () => {
  it("supports only LAN and Headscale modes", () => {
    expect(NetworkModeSchema.options).toEqual(["lan", "headscale"]);
  });

  it("discovers configured endpoints without owning transport", async () => {
    await expect(new LanProvider("ws://lan-hub").discover()).resolves.toEqual([
      { url: "ws://lan-hub", mode: "lan" },
    ]);
    await expect(new HeadscaleProvider("ws://headscale-hub").discover()).resolves.toEqual([
      { url: "ws://headscale-hub", mode: "headscale" },
    ]);
  });
});
