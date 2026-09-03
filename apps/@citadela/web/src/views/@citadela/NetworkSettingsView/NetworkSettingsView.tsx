import { useEffect, useState } from "react";
import ButtonPrimary from "../../../components/@citadela/base/buttons/ButtonPrimary";
import LayerCard from "../../../components/@citadela/base/cards/LayerCard";
import { hubApi, type ProviderConfig } from "../../../services/@citadela/hub/hubApi";

export default function NetworkSettingsView() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void hubApi.listProviders().then(setProviders).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load providers")); }, []);
  async function toggle(provider: ProviderConfig) { try { const updated = await hubApi.configureProvider({ ...provider, enabled: !provider.enabled }); setProviders((current) => current.map((value) => value.mode === updated.mode ? updated : value)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to configure provider"); } }
  return <main className="flex min-w-0 flex-col gap-4">
    <h2 className="sr-only">Network providers</h2>
    {error ? <p className="border border-red-400/40 bg-red-950/20 px-3 py-2 text-xs text-red-200" role="alert">{error}</p> : null}
    <LayerCard title="Network providers" bodyClassName="p-0">
      {providers.length === 0 ? <p className="p-4 text-xs text-muted">No network providers available.</p> : null}
      {providers.map((provider) => <article className="flex items-center justify-between gap-4 p-4" key={provider.mode}>
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-semibold text-primary">{provider.mode === "lan" ? "LAN" : "Headscale"}</h3>
          <p className="mt-1 text-xs text-muted">{provider.enabled ? "Provider is enabled and accepting connections." : "Provider is disabled."}</p>
        </div>
        <ButtonPrimary className="shrink-0" type="button" onClick={() => void toggle(provider)}>{provider.enabled ? "Disable" : "Enable"}</ButtonPrimary>
      </article>)}
    </LayerCard>
  </main>;
}
