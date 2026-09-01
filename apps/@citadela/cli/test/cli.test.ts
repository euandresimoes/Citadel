import { describe, expect, it } from "vitest";
import { identityPath, parseCliArgs } from "../src/cli.js";

describe("Citadela CLI", () => {
  it("parses connector commands and options", () => {
    expect(parseCliArgs(["connect", "--hub", "ws://hub.local", "--network", "lan"])).toEqual({
      command: "connect",
      hub: "ws://hub.local",
      network: "lan",
      deviceId: undefined,
    });
  });

  it("uses the Citadela identity directory", () => {
    expect(identityPath()).toMatch(/[\\/]\.citadela[\\/]identity\.json$/);
  });
});
