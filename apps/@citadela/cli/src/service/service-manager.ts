import { execFileSync } from "node:child_process";
import { chownSync, copyFileSync, existsSync, mkdirSync, mkdirSync as makeDirectory, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const serviceName = "citadela-connector";
export const helperServiceName = "citadela-privileged-helper";
export const connectorServiceUser = "citadela-connector";

export type ServiceState = "running" | "stopped" | "not-installed" | "unknown";

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
After=network-online.target citadela-privileged-helper.service
Requires=citadela-privileged-helper.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=${execStart}
Environment=CITADELA_CONFIG_DIR=${quoteSystemd(options.configDirectory)}
Environment=CITADELA_HELPER_GROUP=${quoteSystemd(connectorServiceUser)}
User=${connectorServiceUser}
Group=${connectorServiceUser}
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

export function helperServiceFilePath(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? join(process.env.ProgramData ?? "C:\\ProgramData", "Citadela", `${helperServiceName}.cmd`) : `/etc/systemd/system/${helperServiceName}.service`;
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

export function prepareLinuxServiceConfig(sourceDirectory: string): string {
  if (process.platform !== "linux") return sourceDirectory;
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    throw new Error("Linux service installation must be run as root so Citadela can create its unprivileged service account");
  }
  try {
    execFileSync("id", ["-u", connectorServiceUser], { stdio: "ignore" });
  } catch {
    execFileSync("useradd", ["--system", "--user-group", "--home-dir", "/var/lib/citadela", "--shell", "/usr/sbin/nologin", connectorServiceUser], { stdio: "inherit" });
  }
  const destination = "/var/lib/citadela";
  makeDirectory(destination, { recursive: true, mode: 0o700 });
  for (const fileName of ["config.json", "identity.json", "permissions.json"]) {
    const source = join(sourceDirectory, fileName);
    const target = join(destination, fileName);
    if (existsSync(source)) copyFileSync(source, target);
    if (existsSync(target)) { chownSync(target, process.getuid(), process.getgid?.() ?? process.getuid()); }
  }
  chownSync(destination, process.getuid(), process.getgid?.() ?? process.getuid());
  execFileSync("chown", ["-R", `${connectorServiceUser}:${connectorServiceUser}`, destination]);
  return destination;
}

export function renderPrivilegedHelperSystemdUnit(options: ServiceInstallOptions): string {
  const execStart = [options.executable, options.cliEntry, "connector", "helper", "run"].map(quoteSystemd).join(" ");
  return `[Unit]\nDescription=Citadela Privileged Helper\nAfter=local-fs.target\n\n[Service]\nType=simple\nExecStart=${execStart}\nEnvironment=CITADELA_CONFIG_DIR=${quoteSystemd(options.configDirectory)}\nEnvironment=CITADELA_HELPER_GROUP=${quoteSystemd(connectorServiceUser)}\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\n`;
}

export function renderPrivilegedHelperWindowsServiceScript(options: ServiceInstallOptions): string {
  return `@echo off\r\nset "CITADELA_CONFIG_DIR=${options.configDirectory}"\r\n${quoteWindows(options.executable)} ${quoteWindows(options.cliEntry)} connector helper run\r\n`;
}

export function installPrivilegedHelperService(options: ServiceInstallOptions): void {
  const platform = options.platform ?? process.platform;
  if (platform === "linux") {
    const path = helperServiceFilePath(platform);
    mkdirSync("/etc/systemd/system", { recursive: true });
    writeFileSync(path, renderPrivilegedHelperSystemdUnit(options), { mode: 0o644 });
    execFileSync("systemctl", ["daemon-reload"]);
    execFileSync("systemctl", ["enable", "--now", helperServiceName]);
    return;
  }
  if (platform === "win32") {
    if (!existsSync(options.cliEntry)) throw new Error(`CLI entry not found: ${options.cliEntry}`);
    const directory = join(process.env.ProgramData ?? "C:\\ProgramData", "Citadela");
    mkdirSync(directory, { recursive: true });
    const path = helperServiceFilePath(platform);
    writeFileSync(path, renderPrivilegedHelperWindowsServiceScript(options), { encoding: "utf8" });
    const binPath = `${quoteWindows(process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")} /d /c ${quoteWindows(path)}`;
    execFileSync("sc.exe", ["create", helperServiceName, "binPath=", binPath, "start=", "auto", "DisplayName=", "Citadela Privileged Helper"], { stdio: "inherit" });
    execFileSync("sc.exe", ["start", helperServiceName], { stdio: "inherit" });
    return;
  }
  throw new Error(`Service installation is not supported on ${platform}`);
}

export function restartService(platform: NodeJS.Platform = process.platform): void {
  if (platform === "linux") {
    execFileSync("systemctl", ["restart", serviceName], { stdio: "inherit" });
    return;
  }
  if (platform === "win32") {
    execFileSync("sc.exe", ["stop", serviceName], { stdio: "inherit" });
    execFileSync("sc.exe", ["start", serviceName], { stdio: "inherit" });
    return;
  }
  throw new Error(`Service restart is not supported on ${platform}`);
}

export function startService(platform: NodeJS.Platform = process.platform): void {
  if (platform === "linux") { execFileSync("systemctl", ["start", serviceName], { stdio: "inherit" }); return; }
  if (platform === "win32") { execFileSync("sc.exe", ["start", serviceName], { stdio: "inherit" }); return; }
  throw new Error(`Service start is not supported on ${platform}`);
}

export function stopService(platform: NodeJS.Platform = process.platform): void {
  if (platform === "linux") { execFileSync("systemctl", ["stop", serviceName], { stdio: "inherit" }); return; }
  if (platform === "win32") { execFileSync("sc.exe", ["stop", serviceName], { stdio: "inherit" }); return; }
  throw new Error(`Service stop is not supported on ${platform}`);
}

export function uninstallService(platform: NodeJS.Platform = process.platform): void {
  if (platform === "linux") {
    execFileSync("systemctl", ["disable", "--now", serviceName], { stdio: "inherit" });
    if (existsSync(serviceFilePath(platform))) unlinkSync(serviceFilePath(platform));
    if (existsSync(helperServiceFilePath(platform))) unlinkSync(helperServiceFilePath(platform));
    execFileSync("systemctl", ["daemon-reload"]);
    return;
  }
  if (platform === "win32") {
    execFileSync("sc.exe", ["stop", serviceName], { stdio: "inherit" });
    execFileSync("sc.exe", ["delete", serviceName], { stdio: "inherit" });
    execFileSync("sc.exe", ["stop", helperServiceName], { stdio: "inherit" });
    execFileSync("sc.exe", ["delete", helperServiceName], { stdio: "inherit" });
    return;
  }
  throw new Error(`Service removal is not supported on ${platform}`);
}

export function serviceStatus(platform: NodeJS.Platform = process.platform): ServiceState {
  if (platform === "linux") {
    if (!existsSync(serviceFilePath(platform))) return "not-installed";
    try { return execFileSync("systemctl", ["is-active", serviceName], { encoding: "utf8" }).trim() === "active" ? "running" : "stopped"; }
    catch { return "stopped"; }
  }
  if (platform === "win32") {
    if (!existsSync(serviceFilePath(platform))) return "not-installed";
    try { return execFileSync("sc.exe", ["query", serviceName], { encoding: "utf8" }).includes("RUNNING") ? "running" : "stopped"; }
    catch { return "unknown"; }
  }
  return "unknown";
}

export function serviceLogs(platform: NodeJS.Platform = process.platform, lines = 40): string {
  if (platform === "linux") {
    try { return execFileSync("journalctl", ["-u", serviceName, "-n", String(lines), "--no-pager"], { encoding: "utf8" }); }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  }
  if (platform === "win32") return "Windows service logs are available through Event Viewer (Windows Logs > System).";
  return "Service logs are not supported on this platform.";
}
