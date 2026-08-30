import { describe, expect, it } from "vitest";
import {
  CitadelMessageSchema,
  CommandResultSchema,
  DeviceHeartbeatMessageSchema,
  DeviceHelloMessageSchema,
  PROTOCOL_VERSION,
} from "../src/index.js";

describe("Citadel protocol", () => {
  it("accepts a valid device hello message", () => {
    const result = DeviceHelloMessageSchema.safeParse({
      type: "device.hello",
      deviceId: "device-01",
      protocolVersion: PROTOCOL_VERSION,
      device: {
        hostname: "workstation",
        platform: "device.platform.windows",
        architecture: "x64",
        capabilities: ["capability.system.metrics"],
        permissions: ["permission.system.metrics.read"],
      },
    });

    expect(result.success).toBe(true);
    expect(
      CitadelMessageSchema.safeParse(result.success ? result.data : {}).success,
    ).toBe(true);
  });

  it("rejects unknown fields in network payloads", () => {
    const result = DeviceHeartbeatMessageSchema.safeParse({
      type: "device.heartbeat",
      deviceId: "device-01",
      timestamp: Date.now(),
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires an error when a command fails", () => {
    expect(
      CommandResultSchema.safeParse({
        type: "command.result",
        commandId: "cmd-01",
        success: false,
      }).success,
    ).toBe(false);
  });
});
