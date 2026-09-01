import { parseArgs } from "node:util";
import { Connector, FileIdentityStore, PairingRequiredError, loadOrCreateIdentity } from "@citadela/connector";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { startTui } from "./tui/start.js";

export interface CliOptions {
  command?: string | undefined;
  hub?: string | undefined;
  network?: "lan" | "headscale" | undefined;
  deviceId?: string | undefined;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      hub: { type: "string" },
      network: { type: "string" },
      "device-id": { type: "string" },
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
  };
}

export function identityPath(): string {
  return join(process.env.CITADELA_CONFIG_DIR ?? join(homedir(), ".citadela"), "identity.json");
}

export function runCli(argv: string[] = process.argv.slice(2)): void {
  const options = parseCliArgs(argv);
  const store = new FileIdentityStore(identityPath());
  const stored = loadOrCreateIdentity(store);

  if (options.command === undefined) {
    startTui({ stored, hub: options.hub, network: options.network });
    return;
  }

  if (options.command === "init" || options.command === "connector init") {
    console.log(`Identity ready: ${stored.identity.fingerprint}`);
    console.log(`Stored at: ${identityPath()}`);
    return;
  }

  if (options.command === "status" || options.command === "connector status") {
    console.log(JSON.stringify({ identity: stored.identity, identityPath: identityPath() }, null, 2));
    return;
  }

  if (options.command === "connect" || options.command === "connector connect") {
    if (!options.hub) throw new Error("The --hub option is required for connect");
    const connector = new Connector({
      url: options.hub,
      deviceId: options.deviceId ?? stored.identity.fingerprint.slice(0, 16),
      networkMode: options.network ?? "lan",
      autoReconnect: true,
    });
    void connector.connect().then((hello) => {
      console.log(`Connected to ${options.hub}`);
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

  console.log("Citadela CLI");
  console.log("Usage: citadela <init|status|connect> [options]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
