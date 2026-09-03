#!/usr/bin/env node

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { Connector, FileIdentityStore, FilePermissionPolicyStore, PairingRequiredError, PermissionLevelSchema, PermissionSchema, loadOrCreateIdentity, loadOrCreatePermissionPolicy, policyForLevel, startPrivilegedHelper } from "@citadela/connector";
import { join } from "node:path";
import { homedir } from "node:os";
import { startTui } from "./tui/start.js";
import { configDirectory, configPath, loadConfig, mergeConfig, saveConfig, type CliNetworkMode } from "./config/config.js";
import { installPrivilegedHelperService, installService, prepareLinuxServiceConfig, renderSystemdUnit, restartService, serviceFilePath, serviceName, windowsServiceCommand } from "./service/service-manager.js";

function configUpdates(options: CliOptions): { hubUrl?: string; network?: CliNetworkMode; deviceId?: string } {
  return {
    ...(options.hub !== undefined ? { hubUrl: options.hub } : {}),
    ...(options.network !== undefined ? { network: options.network } : {}),
    ...(options.deviceId !== undefined ? { deviceId: options.deviceId } : {}),
  };
}

export interface CliOptions {
  command?: string | undefined;
  hub?: string | undefined;
  network?: CliNetworkMode | undefined;
  deviceId?: string | undefined;
  dryRun?: boolean | undefined;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      hub: { type: "string" },
      network: { type: "string" },
      "device-id": { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });

  const network = parsed.values.network;
  if (network !== undefined && network !== "lan" && network !== "headscale") {
    throw new Error(`Unsupported network: ${network}`);
  }

  return {
    command: parsed.positionals.join(" ") || undefined,
    hub: parsed.values.hub,
    network,
    deviceId: parsed.values["device-id"],
    dryRun: parsed.values["dry-run"],
  };
}

export function identityPath(): string {
  return join(process.env.CITADELA_CONFIG_DIR ?? join(homedir(), ".citadela"), "identity.json");
}

export function runCli(argv: string[] = process.argv.slice(2)): void {
  const options = parseCliArgs(argv);
  const savedConfig = loadConfig();

  if (options.command === undefined) {
    const stored = loadOrCreateIdentity(new FileIdentityStore(identityPath()));
    startTui({ stored, hub: options.hub ?? savedConfig.hubUrl, network: options.network ?? savedConfig.network });
    return;
  }

  if (options.command === "init" || options.command === "connector init") {
    const stored = loadOrCreateIdentity(new FileIdentityStore(identityPath()));
    saveConfig(mergeConfig(savedConfig, configUpdates(options)));
    console.log(`Identity ready: ${stored.identity.fingerprint}`);
    console.log(`Stored at: ${identityPath()}`);
    console.log(`Configuration stored at: ${configPath()}`);
    return;
  }

  if (options.command === "status" || options.command === "connector status") {
    const stored = loadOrCreateIdentity(new FileIdentityStore(identityPath()));
    console.log(JSON.stringify({ identity: stored.identity, identityPath: identityPath(), config: savedConfig, configPath: configPath() }, null, 2));
    return;
  }

  if (options.command === "permissions status" || options.command === "connector permissions status") {
    const policy = loadOrCreatePermissionPolicy(new FilePermissionPolicyStore());
    console.log(JSON.stringify(policy, null, 2));
    return;
  }

  if (options.command === "helper run" || options.command === "connector helper run") {
    void startPrivilegedHelper().then((helper) => {
      console.log("Citadela privileged helper is listening on the local IPC endpoint.");
      process.once("SIGINT", () => { void helper.close().finally(() => process.exit(0)); });
      process.once("SIGTERM", () => { void helper.close().finally(() => process.exit(0)); });
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
    return;
  }

  if (options.command.startsWith("permissions set ") || options.command.startsWith("connector permissions set ")) {
    const level = options.command.split(" ").at(-1);
    const policy = policyForLevel(PermissionLevelSchema.parse(level));
    new FilePermissionPolicyStore().save(policy);
    console.log(`Permission level set to ${policy.level}.`);
    return;
  }

  if (options.command.startsWith("permissions grant ") || options.command.startsWith("connector permissions grant ") || options.command.startsWith("permissions revoke ") || options.command.startsWith("connector permissions revoke ")) {
    const parts = options.command.split(" ");
    const operation = parts.at(-2);
    const permission = PermissionSchema.parse(parts.at(-1));
    const store = new FilePermissionPolicyStore();
    const current = loadOrCreatePermissionPolicy(store);
    const permissions = operation === "grant"
      ? [...new Set([...current.permissions, permission])]
      : current.permissions.filter((value) => value !== permission);
    store.save({ ...current, permissions });
    console.log(`${operation === "grant" ? "Granted" : "Revoked"} ${permission}.`);
    return;
  }

  if (options.command === "connect" || options.command === "connector connect" || options.command === "reconnect" || options.command === "connector reconnect") {
    if (options.command.includes("reconnect") && (process.platform === "linux" || process.platform === "win32") && existsSync(serviceFilePath())) {
      restartService();
      console.log(`Service ${serviceName} restarted using the saved Citadela configuration.`);
      return;
    }
    const stored = loadOrCreateIdentity(new FileIdentityStore(identityPath()));
    const hub = options.hub ?? savedConfig.hubUrl;
    if (!hub) throw new Error("The --hub option is required for connect (or run init --hub <url>)");
    saveConfig(mergeConfig(savedConfig, { ...configUpdates(options), hubUrl: hub }));
    const connector = new Connector({
      url: hub,
      deviceId: options.deviceId ?? savedConfig.deviceId ?? stored.identity.fingerprint.slice(0, 16),
      networkMode: options.network ?? savedConfig.network ?? "lan",
      autoReconnect: true,
    });
    void connector.connect().then((hello) => {
      console.log(`Connected to ${hub}`);
      console.log(`Session: ${hello.sessionId}`);
    }).catch((error: unknown) => {
      if (error instanceof PairingRequiredError) {
        console.error(`Pairing approval required: ${error.requestId}`);
      } else {
        console.error(error instanceof Error ? error.message : error);
      }
      process.exitCode = 1;
    });
    process.once("SIGINT", () => connector.close());
    return;
  }

  if (options.command === "service install" || options.command === "connector service install") {
    const serviceOptions = { executable: process.execPath, cliEntry: process.argv[1] ?? "citadela", configDirectory: options.dryRun ? configDirectory() : prepareLinuxServiceConfig(configDirectory()) };
    if (options.dryRun) {
      console.log(process.platform === "win32" ? windowsServiceCommand(serviceOptions).join(" ") : renderSystemdUnit(serviceOptions));
      return;
    }
    installPrivilegedHelperService(serviceOptions);
    installService(serviceOptions);
    console.log(`Services ${serviceName} and citadela-privileged-helper installed.`);
    return;
  }

  console.log("Citadela CLI");
  console.log("Usage: citadela <init|status|connect|reconnect|permissions|helper run|service install> [options]");
}

const isCliEntrypoint = import.meta.url.endsWith("/dist/cli.js");

if (isCliEntrypoint) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
