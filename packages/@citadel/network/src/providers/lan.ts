import type { NetworkEndpoint, NetworkProvider } from "./provider.js";

export class LanProvider implements NetworkProvider {
  public readonly mode = "lan" as const;

  public constructor(private readonly endpoint?: string) {}

  public async discover(): Promise<NetworkEndpoint[]> {
    return this.endpoint ? [{ url: this.endpoint, mode: this.mode }] : [];
  }
}
