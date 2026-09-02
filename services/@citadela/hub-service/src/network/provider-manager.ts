import type { NetworkMode } from "@citadela/protocol";
import type { Pool } from "pg";

export interface ProviderConfig { mode: NetworkMode; enabled: boolean; endpoint?: string; controlPlaneUrl?: string; }

export interface ProviderRepository { list(): Promise<ProviderConfig[]>; save(config: ProviderConfig): Promise<void>; }

export class PostgresProviderRepository implements ProviderRepository {
  public constructor(private readonly pool: Pool) {}
  public async list(): Promise<ProviderConfig[]> { const result = await this.pool.query<{ mode: NetworkMode; enabled: boolean; endpoint: string | null; control_plane_url: string | null }>("SELECT mode, enabled, endpoint, control_plane_url FROM network_providers ORDER BY mode"); return result.rows.map((row) => ({ mode: row.mode, enabled: row.enabled, ...(row.endpoint ? { endpoint: row.endpoint } : {}), ...(row.control_plane_url ? { controlPlaneUrl: row.control_plane_url } : {}) })); }
  public async save(config: ProviderConfig): Promise<void> { await this.pool.query("INSERT INTO network_providers (mode, enabled, endpoint, control_plane_url) VALUES ($1,$2,$3,$4) ON CONFLICT (mode) DO UPDATE SET enabled=EXCLUDED.enabled, endpoint=EXCLUDED.endpoint, control_plane_url=EXCLUDED.control_plane_url, updated_at=NOW()", [config.mode, config.enabled, config.endpoint ?? null, config.controlPlaneUrl ?? null]); }
}

export class NetworkProviderManager {
  private readonly configs = new Map<NetworkMode, ProviderConfig>([["lan", { mode: "lan", enabled: true }], ["headscale", { mode: "headscale", enabled: false }]]);
  public constructor(private readonly repository?: ProviderRepository) {}

  public async list(): Promise<ProviderConfig[]> { if (this.repository) { const saved = await this.repository.list(); for (const config of saved) this.configs.set(config.mode, config); } return [...this.configs.values()]; }
  public async configure(input: ProviderConfig): Promise<ProviderConfig> {
    if (input.mode === "headscale" && input.enabled && !input.endpoint && !input.controlPlaneUrl) throw new Error("Headscale requires an endpoint or control plane URL");
    const config = { mode: input.mode, enabled: Boolean(input.enabled), ...(input.endpoint ? { endpoint: input.endpoint } : {}), ...(input.controlPlaneUrl ? { controlPlaneUrl: input.controlPlaneUrl } : {}) };
    this.configs.set(input.mode, config);
    await this.repository?.save(config);
    return config;
  }
}
