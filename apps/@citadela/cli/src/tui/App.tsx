import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";
import type { StoredIdentity } from "@citadela/connector";
import { Connector, PairingRequiredError } from "@citadela/connector";

interface TuiAppProps {
  stored: StoredIdentity;
  hub?: string | undefined;
  network?: "lan" | "headscale" | undefined;
}

export function TuiApp({ stored, hub, network = "lan" }: TuiAppProps) {
  const [hubInput, setHubInput] = useState(hub ?? "");
  const [activeHub, setActiveHub] = useState(hub);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState(activeHub ? "Connecting…" : "Ready");
  const [pairingRequestId, setPairingRequestId] = useState<string>();
  const [session, setSession] = useState<string>();

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") process.exit(0);
    if (key.name === "r" && activeHub) {
      setStatus("Connecting…");
      setSession(undefined);
      setPairingRequestId(undefined);
      setRetry((value) => value + 1);
    }
  });

  useEffect(() => {
    if (!activeHub) return;
    const connector = new Connector({
      url: activeHub,
      deviceId: stored.identity.fingerprint.slice(0, 16),
      networkMode: network,
      autoReconnect: true,
    });
    void connector.connect().then((hello) => {
      setSession(hello.sessionId);
      setStatus("Connected");
    }).catch((error: unknown) => {
      if (error instanceof PairingRequiredError) {
        setPairingRequestId(error.requestId);
        setStatus("Awaiting pairing approval");
        return;
      }
      setStatus("Connection failed");
    });
    return () => connector.close();
  }, [activeHub, network, retry, stored.identity.fingerprint]);

  const submitHub = (value: string | SubmitEvent): void => {
    if (typeof value !== "string") return;
    const nextHub = value.trim();
    if (!nextHub) return;
    setHubInput(nextHub);
    setPairingRequestId(undefined);
    setStatus("Connecting…");
    setActiveHub(nextHub);
  };

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text fg="#d8d6db">Citadela Connector</text>
      <text> </text>
      <text>Device: {stored.identity.fingerprint.slice(0, 16)}</text>
      <text>Network: {network}</text>
      {!activeHub ? <text>Hub URL:</text> : null}
      {!activeHub ? <input placeholder="ws://127.0.0.1:7555" value={hubInput} focused onInput={setHubInput} onSubmit={submitHub as never} /> : null}
      {activeHub ? <text>Hub: {activeHub}</text> : null}
      <text>Status: {status}</text>
      {session ? <text>Session: {session}</text> : null}
      {pairingRequestId ? <text>Pairing request: {pairingRequestId}</text> : null}
      <text> </text>
      <text fg="#767676c9">{activeHub ? "Press R to reconnect · Q or Esc to quit" : "Press Enter to connect · Q or Esc to quit"}</text>
    </box>
  );
}
