import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type CliNetworkMode = "lan" | "headscale";

export interface CitadelaConfig {
  hubUrl?: string;
  network?: CliNetworkMode;
  deviceId?: string;
}

export function configDirectory(): string {
  return process.env.CITADELA_CONFIG_DIR ?? join(homedir(), ".citadela");
}

export function configPath(): string {
  return join(configDirectory(), "config.json");
}

function parseConfig(value: unknown): CitadelaConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Citadela configuration file");
  }

  const input = value as Record<string, unknown>;
  if (input.hubUrl !== undefined && typeof input.hubUrl !== "string") {
    throw new Error("Invalid Citadela hub URL in configuration file");
  }
  if (input.network !== undefined && input.network !== "lan" && input.network !== "headscale") {
    throw new Error("Invalid Citadela network in configuration file");
  }
  if (input.deviceId !== undefined && typeof input.deviceId !== "string") {
    throw new Error("Invalid Citadela device ID in configuration file");
  }

  return {
    ...(typeof input.hubUrl === "string" ? { hubUrl: input.hubUrl } : {}),
    ...(input.network === "lan" || input.network === "headscale" ? { network: input.network } : {}),
    ...(typeof input.deviceId === "string" ? { deviceId: input.deviceId } : {}),
  };
}

export function loadConfig(filePath = configPath()): CitadelaConfig {
  try {
    return parseConfig(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export function saveConfig(config: CitadelaConfig, filePath = configPath()): void {
  const normalized = parseConfig(config);
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, filePath);
  chmodSync(filePath, 0o600);
}

export function mergeConfig(current: CitadelaConfig, updates: CitadelaConfig): CitadelaConfig {
  return {
    ...current,
    ...updates,
  };
}
