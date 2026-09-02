import { describe, expect, it } from "vitest";
import {
  CitadelaMessageSchema,
  CommandResultSchema,
  DeviceHeartbeatMessageSchema,
  DeviceHelloMessageSchema,
  HubHelloMessageSchema,
  PROTOCOL_VERSION,
  PairingPendingMessageSchema,
} from "../src/index.js";
import { SystemMetricsSchema } from "../src/devices/system-metrics.js";

describe("Citadela protocol", () => {
  it("validates bounded system metrics snapshots", () => {
    expect(SystemMetricsSchema.parse({ cpuLoadPercent: 42, memoryUsedBytes: 10, memoryTotalBytes: 20, collectedAt: "2026-01-01T00:00:00.000Z" })).toBeTruthy();
    expect(() => SystemMetricsSchema.parse({ cpuLoadPercent: 101, memoryUsedBytes: 10, memoryTotalBytes: 20, collectedAt: "2026-01-01T00:00:00.000Z" })).toThrow();
  });
  it("accepts a valid device hello message", () => {
    const result = DeviceHelloMessageSchema.safeParse({
      type: "device.hello",
      deviceId: "device-01",
      connectionId: "connection-01",
      networkMode: "lan",
      protocolVersion: PROTOCOL_VERSION,
      identity: {
        algorithm: "ed25519",
        publicKey: "public-key",
        fingerprint: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
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
      CitadelaMessageSchema.safeParse(result.success ? result.data : {}).success,
    ).toBe(true);
  });

  it("rejects unknown fields in network payloads", () => {
    const result = DeviceHeartbeatMessageSchema.safeParse({
        type: "device.heartbeat",
        deviceId: "device-01",
        connectionId: "connection-01",
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

  it("accepts the hub handshake response", () => {
    expect(
      HubHelloMessageSchema.parse({
        type: "hub.hello",
        deviceId: "device-01",
        connectionId: "connection-01",
        networkMode: "lan",
        protocolVersion: PROTOCOL_VERSION,
        sessionId: "session-01",
      }).type,
    ).toBe("hub.hello");
  });

  it("accepts a pending pairing notification", () => {
    expect(
      PairingPendingMessageSchema.parse({
        type: "pairing.pending",
        requestId: "request-01",
        deviceId: "device-01",
        identity: {
          algorithm: "ed25519",
          publicKey: "public-key",
          fingerprint: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      }).type,
    ).toBe("pairing.pending");
  });
});
