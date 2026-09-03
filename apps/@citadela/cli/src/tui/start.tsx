import { createCliRenderer, setRenderLibPath } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Connector, PairingRequiredError, type StoredIdentity } from "@citadela/connector";
import { TuiApp } from "./App.js";

export interface StartTuiOptions {
  stored: StoredIdentity;
  hub?: string | undefined;
  network?: "lan" | "headscale" | undefined;
}

export function startTui(options: StartTuiOptions): void {
  if (process.env.CITADELA_OPENTUI_LIB) setRenderLibPath(process.env.CITADELA_OPENTUI_LIB);
  void createCliRenderer({ exitOnCtrlC: true })
    .then((renderer) => {
      createRoot(renderer).render(<TuiApp {...options} />);
    })
    .catch((error: unknown) => {
      void startTextFallback(options, error);
    });
}

async function startTextFallback(options: StartTuiOptions, error: unknown): Promise<void> {
  console.warn("Citadela TUI is unavailable in this Node.js runtime; using terminal fallback.");
  if (error instanceof Error) console.warn(`Reason: ${error.message}`);

  const prompt = createInterface({ input, output });
  const hub = (options.hub ?? await prompt.question("Hub WebSocket URL: ")).trim();
  const network = options.network ?? ((await prompt.question("Network mode (lan/headscale) [lan]: ")).trim() || "lan");
  prompt.close();

  if (!hub || (network !== "lan" && network !== "headscale")) {
    console.error("A valid Hub URL and network mode are required.");
    return;
  }

  const connector = new Connector({
    url: hub,
    deviceId: options.stored.identity.fingerprint.slice(0, 16),
    networkMode: network,
    autoReconnect: true,
  });

  try {
    const hello = await connector.connect();
    console.log(`Connected to ${hub}`);
    console.log(`Session: ${hello.sessionId}`);
    console.log("Connector is running. Press Ctrl+C to stop.");
    await new Promise<void>(() => undefined);
  } catch (connectionError: unknown) {
    if (connectionError instanceof PairingRequiredError) {
      console.log(`Awaiting pairing approval. Request: ${connectionError.requestId}`);
    } else {
      console.error(connectionError instanceof Error ? connectionError.message : connectionError);
    }
    connector.close();
  }
}
