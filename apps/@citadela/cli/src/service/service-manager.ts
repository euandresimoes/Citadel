import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const serviceName = "citadela-connector";

export interface ServiceInstallOptions {
  executable: string;
  cliEntry: string;
  configDirectory: string;
  platform?: NodeJS.Platform;
}

function quoteSystemd(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function quoteWindows(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function renderSystemdUnit(options: ServiceInstallOptions): string {
  const execStart = [options.executable, options.cliEntry, "connector", "connect"]
    .map(quoteSystemd)
    .join(" ");
  return `[Unit]
Description=Citadela Connector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${execStart}
Environment=CITADELA_CONFIG_DIR=${quoteSystemd(options.configDirectory)}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`;
}

export function windowsServiceCommand(options: ServiceInstallOptions): string[] {
  const binPath = `${quoteWindows(process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")} /d /c ${quoteWindows(serviceFilePath("win32"))}`;
  return ["create", serviceName, "binPath=", binPath, "start=", "auto", "DisplayName=", "Citadela Connector"];
}

export function renderWindowsServiceScript(options: ServiceInstallOptions): string {
  return `@echo off\r\nset "CITADELA_CONFIG_DIR=${options.configDirectory}"\r\n${quoteWindows(options.executable)} ${quoteWindows(options.cliEntry)} connector connect\r\n`;
}

export function serviceFilePath(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? join(process.env.ProgramData ?? "C:\\ProgramData", "Citadela", `${serviceName}.cmd`) : `/etc/systemd/system/${serviceName}.service`;
}

export function installService(options: ServiceInstallOptions): void {
  const platform = options.platform ?? process.platform;
  if (platform === "linux") {
    const path = serviceFilePath(platform);
    mkdirSync("/etc/systemd/system", { recursive: true });
    writeFileSync(path, renderSystemdUnit(options), { mode: 0o644 });
    execFileSync("systemctl", ["daemon-reload"]);
    execFileSync("systemctl", ["enable", "--now", serviceName]);
    return;
  }
  if (platform === "win32") {
    if (!existsSync(options.cliEntry)) throw new Error(`CLI entry not found: ${options.cliEntry}`);
    const path = serviceFilePath(platform);
    mkdirSync(join(process.env.ProgramData ?? "C:\\ProgramData", "Citadela"), { recursive: true });
    writeFileSync(path, renderWindowsServiceScript(options), { encoding: "utf8" });
    execFileSync("sc.exe", windowsServiceCommand(options), { stdio: "inherit" });
    execFileSync("sc.exe", ["start", serviceName], { stdio: "inherit" });
    return;
  }
  throw new Error(`Service installation is not supported on ${platform}`);
}
