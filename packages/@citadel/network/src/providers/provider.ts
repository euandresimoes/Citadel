import type { NetworkMode } from "../modes/network-mode.js";

export interface NetworkEndpoint {
  url: string;
  mode: NetworkMode;
}

export interface NetworkProvider {
  readonly mode: NetworkMode;
  discover(): Promise<NetworkEndpoint[]>;
}
