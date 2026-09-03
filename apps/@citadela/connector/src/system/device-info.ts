import os from "node:os";
import type { DeviceInfo, Permission, SystemInfo, SystemMetrics } from "@citadela/protocol";

export function collectDeviceInfo(permissions: Permission[] = [
  "permission.system.info.read",
  "permission.system.metrics.read",
  "permission.system.power.restart",
  "permission.system.power.shutdown",
  "permission.system.power.sleep",
]): DeviceInfo {
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
      "capability.system.power.restart",
      "capability.system.power.shutdown",
      "capability.system.power.sleep",
      "capability.system.terminal",
    ],
    permissions,
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

export function collectSystemMetrics(): SystemMetrics {
  const total = os.totalmem();
  const load = os.loadavg()[0] ?? 0;
  return { cpuLoadPercent: Math.min(100, Math.max(0, Number((load / Math.max(1, os.cpus().length) * 100).toFixed(2)))), memoryUsedBytes: total - os.freemem(), memoryTotalBytes: total, collectedAt: new Date().toISOString() };
}
