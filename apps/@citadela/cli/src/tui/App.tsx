import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ScrollBoxRenderable, SelectOption } from "@opentui/core";
import { existsSync } from "node:fs";
import type { Permission, PermissionLevel, StoredIdentity } from "@citadela/connector";
import { Connector, FilePermissionPolicyStore, PairingRequiredError, loadOrCreatePermissionPolicy, policyForLevel } from "@citadela/connector";
import { configDirectory, loadConfig, mergeConfig, saveConfig } from "../config/config.js";
import { connectorServiceUser, helperServiceName, installPrivilegedHelperService, installService, restartService, serviceFilePath, serviceName, serviceStatus, serviceLogs, startService, stopService, uninstallService, type ServiceState } from "../service/service-manager.js";

type Panel = "connection" | "permissions" | "advanced" | "services" | "diagnostics";
interface TuiAppProps { stored: StoredIdentity; hub?: string | undefined; network?: "lan" | "headscale" | undefined; }

const C = { bg: "#070707", panel: "#101010", raised: "#181818", border: "#2b2b2b", active: "#f5f5f5", text: "#e5e5e5", muted: "#787878", accent: "#bdbdbd", success: "#65d391", warning: "#e6b86a", danger: "#ed7474" };
const levels: Array<{ level: PermissionLevel; title: string; description: string }> = [
  { level: "restricted", title: "Restricted", description: "Read-only device information and metrics." },
  { level: "operator", title: "Operator", description: "Device information plus power actions." },
  { level: "full-control", title: "Full control", description: "All supported actions, including shell execution." },
];
const permissionItems: Array<{ permission: Permission; label: string }> = [
  { permission: "permission.system.info.read", label: "Read device information" },
  { permission: "permission.system.metrics.read", label: "Read system metrics" },
  { permission: "permission.system.power.restart", label: "Restart device" },
  { permission: "permission.system.power.shutdown", label: "Shutdown device" },
  { permission: "permission.system.power.sleep", label: "Sleep device" },
  { permission: "permission.system.power.wake", label: "Wake device" },
  { permission: "permission.system.terminal.use", label: "Execute terminal commands" },
];

export function TuiApp({ stored, hub, network = "lan" }: TuiAppProps) {
  const dimensions = useTerminalDimensions();
  const savedConfig = useMemo(() => loadConfig(), []);
  const [panel, setPanel] = useState<Panel>("connection");
  const [hubInput, setHubInput] = useState(hub ?? "");
  const [activeHub, setActiveHub] = useState(hub);
  const [networkMode, setNetworkMode] = useState<"lan" | "headscale">(network);
  const [retry, setRetry] = useState(0);
  const [installed, setInstalled] = useState(serviceInstalled());
  const [status, setStatus] = useState(serviceInstalled() ? "Managed by service" : activeHub ? "Connecting…" : "Ready");
  const [pairingRequestId, setPairingRequestId] = useState<string>();
  const [session, setSession] = useState<string>();
  const [policy, setPolicy] = useState(() => loadOrCreatePermissionPolicy(new FilePermissionPolicyStore()));
  const [permissionIndex, setPermissionIndex] = useState(0);
  const [serviceMessage, setServiceMessage] = useState(serviceInstalled() ? `Service ${serviceName} is installed.` : "Service is not installed.");
  const [serviceState, setServiceState] = useState<ServiceState>(() => serviceStatus());
  const [serviceLog, setServiceLog] = useState("");
  const width = Math.min(104, Math.max(72, Math.floor(dimensions.width * 0.78)));
  const height = Math.min(32, Math.max(22, Math.floor(dimensions.height * 0.78)));

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") process.exit(0);
    const panelShortcut = key.meta || key.option;
    if ((panel !== "permissions" || panelShortcut) && key.name === "1") setPanel("connection");
    if ((panel !== "permissions" || panelShortcut) && key.name === "2") setPanel("permissions");
    if ((panel !== "permissions" || panelShortcut) && key.name === "3") setPanel("advanced");
    if ((panel !== "permissions" || panelShortcut) && key.name === "4") setPanel("services");
    if ((panel !== "permissions" || panelShortcut) && key.name === "5") setPanel("diagnostics");
    if (key.name === "r") {
      setSession(undefined); setPairingRequestId(undefined); setStatus("Reconnecting…");
      if (installed) { try { restartService(); setServiceState("running"); setStatus("Service restarted"); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to restart service"); } }
      else setRetry((value) => value + 1);
    }
    if (panel === "permissions" && !panelShortcut && (key.name === "1" || key.name === "2" || key.name === "3")) {
      const selectedLevel = levels[Number(key.name) - 1];
      if (!selectedLevel) return;
      const next = policyForLevel(selectedLevel.level);
      new FilePermissionPolicyStore().save(next); setPolicy(next); setStatus(`Permission level saved: ${next.level}`);
      if (activeHub && !installed) setRetry((value) => value + 1);
    }
    if (panel === "advanced" && (key.name === "j" || key.name === "down")) setPermissionIndex((value) => Math.min(permissionItems.length - 1, value + 1));
    if (panel === "advanced" && (key.name === "k" || key.name === "up")) setPermissionIndex((value) => Math.max(0, value - 1));
    if (panel === "advanced" && (key.name === "space" || key.sequence === " ")) {
      const item = permissionItems[permissionIndex];
      if (!item) return;
      const permissions = policy.permissions.includes(item.permission) ? policy.permissions.filter((value) => value !== item.permission) : [...policy.permissions, item.permission];
      const next = { ...policy, permissions };
      new FilePermissionPolicyStore().save(next); setPolicy(next); setStatus(`Permission ${permissions.includes(item.permission) ? "enabled" : "disabled"}`);
      if (activeHub && !installed) setRetry((value) => value + 1);
    }
    if (panel === "services" && key.name === "i") {
      try { const options = { executable: process.execPath, cliEntry: process.argv[1] ?? "citadela", configDirectory: configDirectory() }; installPrivilegedHelperService(options); installService(options); setInstalled(true); setServiceState("running"); setServiceMessage(`Installed ${helperServiceName} and ${serviceName}.`); setStatus("Services installed"); }
      catch (error) { setServiceMessage(error instanceof Error ? error.message : "Unable to install services"); setStatus("Service installation failed"); }
    }
    if (panel === "services" && key.name === "s") { try { startService(); setServiceState("running"); setServiceMessage("Connector service started."); } catch (error) { setServiceMessage(error instanceof Error ? error.message : "Unable to start service"); } }
    if (panel === "services" && key.name === "p") { try { stopService(); setServiceState("stopped"); setServiceMessage("Connector service stopped."); } catch (error) { setServiceMessage(error instanceof Error ? error.message : "Unable to stop service"); } }
    if (panel === "services" && key.name === "u") { try { uninstallService(); setInstalled(false); setServiceState("not-installed"); setServiceMessage("Connector services removed."); } catch (error) { setServiceMessage(error instanceof Error ? error.message : "Unable to remove services"); } }
    if (panel === "services" && key.name === "l") setServiceLog(serviceLogs());
  });

  useEffect(() => {
    if (!activeHub || installed) return;
    const connector = new Connector({ url: activeHub, deviceId: stored.identity.fingerprint.slice(0, 16), networkMode, autoReconnect: true });
    setStatus("Connecting…");
    void connector.connect().then((hello) => { setSession(hello.sessionId); setStatus("Connected"); }).catch((error: unknown) => {
      if (error instanceof PairingRequiredError) { setPairingRequestId(error.requestId); setStatus("Awaiting pairing approval"); return; }
      setStatus(error instanceof Error ? error.message : "Connection failed");
    });
    return () => connector.close();
  }, [activeHub, installed, networkMode, retry, stored.identity.fingerprint]);

  const submitHub = (value: string | SubmitEvent): void => { if (typeof value !== "string" || !value.trim()) return; const next = value.trim(); saveConfig(mergeConfig(savedConfig, { hubUrl: next, network: networkMode })); setHubInput(next); setActiveHub(next); setRetry((v) => v + 1); };
  const changeNetwork = (_index: number, option: SelectOption | null): void => { if (option?.value !== "lan" && option?.value !== "headscale") return; setNetworkMode(option.value); saveConfig(mergeConfig(savedConfig, { network: option.value })); if (activeHub && !installed) setRetry((v) => v + 1); };

  return <box width="100%" height="100%" backgroundColor={C.bg} alignItems="center" justifyContent="center">
    <box width={width} height={height} border borderStyle="single" borderColor={C.border} backgroundColor={C.panel} flexDirection="column">
      <box height={4} paddingLeft={2} paddingRight={2} flexDirection="row" justifyContent="space-between" alignItems="center" borderColor={C.border} borderStyle="single"><box flexDirection="column"><text fg={C.text}>Citadela Connector</text><text fg={C.muted}>Local device control plane</text></box><box flexDirection="row" gap={1} alignItems="center"><LoadingIndicator active={isTransientStatus(status)} /><text fg={statusColor(status)}>{status}</text></box></box>
      <box flexDirection="row" flexGrow={1}>
        <box width={22} padding={1} backgroundColor={C.panel} borderColor={C.border} borderStyle="single" flexDirection="column" gap={1}><text fg={C.muted}>WORKSPACE</text><NavItem label="Connection" shortcut="1" active={panel === "connection"} /><NavItem label="Permissions" shortcut="2" active={panel === "permissions"} /><NavItem label="Advanced" shortcut="3" active={panel === "advanced"} /><NavItem label="Services" shortcut="4" active={panel === "services"} /><NavItem label="Diagnostics" shortcut="5" active={panel === "diagnostics"} /><box flexGrow={1} /><text fg={C.muted}>DEVICE</text><text fg={C.text}>{stored.identity.fingerprint.slice(0, 16)}</text><text fg={C.muted}>{networkMode}</text></box>
        <box flexGrow={1} padding={2} flexDirection="column" alignItems="stretch" overflow="hidden">{panel === "connection" ? <ConnectionPanel hubInput={hubInput} onHubInput={setHubInput} onHubSubmit={submitHub} networkMode={networkMode} onNetworkChange={changeNetwork} activeHub={activeHub} session={session} pairingRequestId={pairingRequestId} serviceInstalled={installed} loading={isTransientStatus(status)} /> : null}{panel === "permissions" ? <PermissionsPanel policy={policy} /> : null}{panel === "advanced" ? <AdvancedPermissionsPanel policy={policy} selectedIndex={permissionIndex} /> : null}{panel === "services" ? <ServicesPanel installed={installed} state={serviceState} message={serviceMessage} log={serviceLog} /> : null}{panel === "diagnostics" ? <DiagnosticsPanel identity={stored.identity.fingerprint} hub={activeHub} network={networkMode} status={status} session={session} serviceState={serviceState} /> : null}</box>
      </box>
      <box height={3} paddingLeft={2} paddingRight={2} borderColor={C.border} borderStyle="single" alignItems="center"><text fg={C.muted}>1 Connection  2 Permissions  3 Advanced  4 Services  5 Diagnostics   R Reconnect   Q Quit</text></box>
    </box>
  </box>;
}

function ConnectionPanel(props: { hubInput: string; onHubInput: (value: string) => void; onHubSubmit: (value: string | SubmitEvent) => void; networkMode: "lan" | "headscale"; onNetworkChange: (_index: number, option: SelectOption | null) => void; activeHub?: string | undefined; session?: string | undefined; pairingRequestId?: string | undefined; serviceInstalled: boolean; loading: boolean }) { return <box flexDirection="column" gap={1}><text fg={C.text}>Connection</text><text fg={C.muted}>Configure the Hub endpoint used by this device.</text><box border borderStyle="single" borderColor={C.border} backgroundColor={C.raised} padding={1} flexDirection="column" gap={1}><text fg={C.muted}>HUB WEBSOCKET URL</text><input value={props.hubInput} placeholder="ws://192.168.0.104:45523/realtime/" onInput={props.onHubInput} onSubmit={props.onHubSubmit as never} focused={!props.serviceInstalled} /><text fg={C.muted}>Press Enter to save and connect.</text></box><box flexDirection="row" gap={2}><box border borderStyle="single" borderColor={C.border} backgroundColor={C.raised} padding={1} width={30} height={7} flexDirection="column"><text fg={C.muted}>NETWORK MODE</text><select options={[{ name: "LAN", description: "Local network", value: "lan" }, { name: "Headscale", description: "Private mesh", value: "headscale" }]} focused={!props.serviceInstalled} onChange={props.onNetworkChange} style={{ flexGrow: 1 }} /></box><box border borderStyle="single" borderColor={C.border} backgroundColor={C.raised} padding={1} flexGrow={1} height={7} flexDirection="column" gap={1}><text fg={C.muted}>SESSION</text><text fg={props.activeHub ? C.text : C.muted}>{props.activeHub ?? "Not configured"}</text><box flexDirection="row" gap={1} alignItems="center"><LoadingIndicator active={props.loading} /><text fg={C.muted}>{props.session ? `Session ${props.session}` : props.serviceInstalled ? "Managed by installed service" : props.pairingRequestId ? `Pairing request ${props.pairingRequestId}` : "No active session"}</text></box></box></box></box>; }
function PermissionsPanel({ policy }: { policy: ReturnType<typeof loadOrCreatePermissionPolicy> }) { return <box width="100%" flexDirection="column" gap={1}><text fg={C.text}>Permissions</text><text fg={C.muted}>Select the authority preset for this device.</text>{levels.map((option, index) => <box key={option.level} width="100%" border borderStyle="single" borderColor={policy.level === option.level ? C.active : C.border} backgroundColor={policy.level === option.level ? C.raised : C.panel} paddingLeft={1} paddingRight={1} height={3} alignItems="center"><text fg={policy.level === option.level ? C.text : C.muted}>{index + 1}. {option.title}{policy.level === option.level ? "  [active]" : ""} — {option.description}</text></box>)}<text fg={C.warning}>1/2/3 select preset  Alt+1/2/3/4/5 navigate</text></box>; }
function AdvancedPermissionsPanel({ policy, selectedIndex }: { policy: ReturnType<typeof loadOrCreatePermissionPolicy>; selectedIndex: number }) { const scrollRef = useRef<ScrollBoxRenderable>(null); useEffect(() => { scrollRef.current?.scrollTo({ x: 0, y: Math.max(0, (selectedIndex - 3) * 2) }); }, [selectedIndex]); return <box width="100%" flexGrow={1} minHeight={0} flexDirection="column" gap={1}><text fg={C.text}>Advanced permissions</text><text fg={C.muted}>Edit the individual permissions granted by the active preset.</text><box width="100%" flexGrow={1} minHeight={0} border borderStyle="single" borderColor={C.border} backgroundColor={C.raised} padding={1} flexDirection="column" gap={1}><text fg={C.muted}>ACTIVE PRESET: {policy.level}</text><scrollbox ref={scrollRef} width="100%" flexGrow={1} minHeight={0} scrollY scrollbarOptions={{ trackOptions: { foregroundColor: C.border } }}>{permissionItems.map((item, index) => <box key={item.permission} width="100%" height={2} paddingLeft={1} paddingRight={1} backgroundColor={index === selectedIndex ? C.panel : C.raised} alignItems="center"><text fg={index === selectedIndex ? C.active : policy.permissions.includes(item.permission) ? C.text : C.border}>{index === selectedIndex ? "›" : " "} {policy.permissions.includes(item.permission) ? "✓" : "·"} {item.label}</text></box>)}</scrollbox></box><text fg={C.warning}>J/K or arrows select  Space toggle  Changes are stored locally</text></box>; }
function ServicesPanel({ installed, state, message, log }: { installed: boolean; state: ServiceState; message: string; log: string }) { return <box flexDirection="column" gap={1}><text fg={C.text}>Services</text><text fg={C.muted}>Run the connector continuously without keeping this TUI open.</text><box border borderStyle="single" borderColor={state === "running" ? C.success : C.border} backgroundColor={C.raised} padding={1} flexDirection="column" gap={1}><text fg={state === "running" ? C.success : C.warning}>{installed ? `● Connector service ${state}` : "○ Services not installed"}</text><text fg={C.muted}>{message}</text><text fg={C.muted}>Helper: privileged local IPC service</text><text fg={C.muted}>Connector: {connectorServiceUser} (unprivileged on Linux)</text></box>{log ? <box border borderStyle="single" borderColor={C.border} backgroundColor={C.panel} padding={1} height={8}><text fg={C.muted}>{log.slice(-1600)}</text></box> : null}<text fg={C.text}>I install  S start  P stop  R restart  U remove  L logs</text></box>; }
function DiagnosticsPanel({ identity, hub, network, status, session, serviceState }: { identity: string; hub?: string | undefined; network: "lan" | "headscale"; status: string; session?: string | undefined; serviceState: ServiceState }) { return <box flexDirection="column" gap={1}><text fg={C.text}>Diagnostics</text><text fg={C.muted}>Runtime details useful when troubleshooting a device connection.</text><box border borderStyle="single" borderColor={C.border} backgroundColor={C.raised} padding={1} flexDirection="column" gap={1}><DiagnosticRow label="Fingerprint" value={identity} /><DiagnosticRow label="Hub" value={hub ?? "Not configured"} /><DiagnosticRow label="Network" value={network} /><DiagnosticRow label="Connection" value={status} /><DiagnosticRow label="Session" value={session ?? "None"} /><DiagnosticRow label="Service" value={serviceState} /></box><text fg={C.muted}>Configuration: {configDirectory()}</text></box>; }
function DiagnosticRow({ label, value }: { label: string; value: string }) { return <box flexDirection="row"><text fg={C.muted} width={16}>{label}</text><text fg={C.text}>{value}</text></box>; }
function NavItem({ label, shortcut, active }: { label: string; shortcut: string; active: boolean }) { return <box backgroundColor={active ? C.raised : C.panel} paddingLeft={1} paddingRight={1} height={2} flexDirection="row" justifyContent="space-between" alignItems="center"><text fg={active ? C.text : C.muted}>{active ? "› " : "  "}{label}</text><text fg={C.muted}>{shortcut}</text></box>; }
function useLoadingFrame(active: boolean): number { const [frame, setFrame] = useState(0); useEffect(() => { if (!active) return; const timer = setInterval(() => setFrame((value) => (value + 1) % 16), 120); return () => clearInterval(timer); }, [active]); return active ? frame : 0; }
function LoadingIndicator({ active }: { active: boolean }) { const frame = useLoadingFrame(active); const length = 16; return <box flexDirection="row">{Array.from({ length }, (_, index) => { const distance = (index - frame + length) % length; const glyph = distance === 0 ? "█" : distance === 1 ? "▓" : distance === 2 ? "▒" : distance === 3 ? "░" : "─"; const color = distance === 0 ? C.active : distance === 1 ? C.text : distance <= 3 ? C.muted : C.border; return <text key={index} fg={active ? color : C.border}>{glyph}</text>; })}</box>; }
function isTransientStatus(status: string): boolean { return status.includes("Connecting") || status.includes("Reconnecting") || status.includes("Awaiting"); }
function statusColor(status: string): string { if (status === "Connected" || status.includes("installed")) return C.success; if (status.includes("failed") || status.includes("Unable")) return C.danger; if (status.includes("Awaiting") || status.includes("Connecting") || status.includes("restarting")) return C.warning; return C.muted; }
function serviceInstalled(): boolean { return existsSync(serviceFilePath()); }
