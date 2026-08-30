import { describe, expect, it } from "vitest";
import { HeadscaleProvider, LanProvider, NetworkModeSchema, parseLanMdnsRecords } from "../src/index.js";

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

  it("parses a Citadel mDNS service advertisement", () => {
    expect(parseLanMdnsRecords([
      { name: "_citadel._tcp.local", type: "PTR", data: "Citadel Hub._citadel._tcp.local" },
      { name: "Citadel Hub._citadel._tcp.local", type: "SRV", data: { target: "hub.local", port: 75523 } },
      { name: "hub.local", type: "A", data: "192.168.1.10" },
    ])).toEqual([{ url: "ws://192.168.1.10:75523", mode: "lan" }]);
  });
});
