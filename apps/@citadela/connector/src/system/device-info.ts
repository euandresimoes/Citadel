import os from "node:os";
import type { DeviceInfo, SystemInfo } from "@citadela/protocol";

export function collectDeviceInfo(): DeviceInfo {
  const platform = os.platform();
  const devicePlatform =
    platform === "win32"
      ? "device.platform.windows"
      : platform === "darwin"
        ? "device.platform.macos"
        : platform === "linux"
          ? "device.platform.linux"
          : undefined;

  if (!devicePlatform) {
    throw new Error(`Unsupported operating system platform: ${platform}`);
  }

  return {
    hostname: os.hostname(),
    platform: devicePlatform,
    architecture: os.arch(),
    capabilities: [
      "capability.system.info",
      "capability.system.metrics",
    ],
    permissions: [
      "permission.system.info.read",
      "permission.system.metrics.read",
    ],
  };
}

export function collectSystemInfo(): SystemInfo {
  const device = collectDeviceInfo();
  return {
    hostname: device.hostname,
    platform: device.platform,
    architecture: device.architecture,
    cpuCount: os.cpus().length,
    memoryBytes: os.totalmem(),
    uptimeSeconds: Math.floor(os.uptime()),
  };
}
