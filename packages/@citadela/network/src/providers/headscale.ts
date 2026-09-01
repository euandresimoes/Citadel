import type { NetworkEndpoint, NetworkProvider } from "./provider.js";

export class HeadscaleProvider implements NetworkProvider {
  public readonly mode = "headscale" as const;

  public constructor(
    private readonly endpoint?: string,
    private readonly controlPlaneUrl?: string,
    private readonly apiKey?: string,
  ) {}

  public async discover(): Promise<NetworkEndpoint[]> {
    return this.endpoint ? [{ url: this.endpoint, mode: this.mode }] : [];
  }

  public async isAvailable(): Promise<boolean> {
    if (!this.controlPlaneUrl) return Boolean(this.endpoint);
    try {
      const init: RequestInit = {};
      if (this.apiKey) init.headers = { authorization: `Bearer ${this.apiKey}` };
      const response = await fetch(new URL("/health", this.controlPlaneUrl), init);
      return response.ok;
    } catch {
      return false;
    }
  }
}
