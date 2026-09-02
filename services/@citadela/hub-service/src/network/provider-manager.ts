import type { NetworkMode } from "@citadela/protocol";

export interface ProviderConfig { mode: NetworkMode; enabled: boolean; endpoint?: string; controlPlaneUrl?: string; }

export class NetworkProviderManager {
  private readonly configs = new Map<NetworkMode, ProviderConfig>([["lan", { mode: "lan", enabled: true }], ["headscale", { mode: "headscale", enabled: false }]]);

  public list(): ProviderConfig[] { return [...this.configs.values()]; }
  public configure(input: ProviderConfig): ProviderConfig {
    if (input.mode === "headscale" && input.enabled && !input.endpoint && !input.controlPlaneUrl) throw new Error("Headscale requires an endpoint or control plane URL");
    const config = { mode: input.mode, enabled: Boolean(input.enabled), ...(input.endpoint ? { endpoint: input.endpoint } : {}), ...(input.controlPlaneUrl ? { controlPlaneUrl: input.controlPlaneUrl } : {}) };
    this.configs.set(input.mode, config);
    return config;
  }
}
