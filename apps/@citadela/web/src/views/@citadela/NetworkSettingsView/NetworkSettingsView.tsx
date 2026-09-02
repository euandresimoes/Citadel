import { useEffect, useState } from "react";
import ButtonPrimary from "../../../components/@citadela/base/buttons/ButtonPrimary";
import { hubApi, type ProviderConfig } from "../../../services/@citadela/hub/hubApi";

export default function NetworkSettingsView() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void hubApi.listProviders().then(setProviders).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load providers")); }, []);
  async function toggle(provider: ProviderConfig) { try { const updated = await hubApi.configureProvider({ ...provider, enabled: !provider.enabled }); setProviders((current) => current.map((value) => value.mode === updated.mode ? updated : value)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to configure provider"); } }
  return <main><h2>Network providers</h2>{error ? <p role="alert">{error}</p> : null}<ul>{providers.map((provider) => <li key={provider.mode}><strong>{provider.mode === "lan" ? "LAN" : "Headscale"}</strong> — {provider.enabled ? "enabled" : "disabled"} <ButtonPrimary type="button" onClick={() => void toggle(provider)}>{provider.enabled ? "Disable" : "Enable"}</ButtonPrimary></li>)}</ul></main>;
}
