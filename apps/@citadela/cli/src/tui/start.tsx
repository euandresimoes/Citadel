import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { StoredIdentity } from "@citadela/connector";
import { TuiApp } from "./App.js";

export interface StartTuiOptions {
  stored: StoredIdentity;
  hub?: string | undefined;
  network?: "lan" | "headscale" | undefined;
}

export function startTui(options: StartTuiOptions): void {
  void createCliRenderer({ exitOnCtrlC: true }).then((renderer) => {
    createRoot(renderer).render(<TuiApp {...options} />);
  });
}
