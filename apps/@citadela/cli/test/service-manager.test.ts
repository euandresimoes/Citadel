import { describe, expect, it } from "vitest";
import { renderSystemdUnit, renderWindowsServiceScript, serviceFilePath, windowsServiceCommand } from "../src/service/service-manager.js";

const options = {
  executable: "/usr/bin/node",
  cliEntry: "/opt/citadela/dist/cli.js",
  configDirectory: "/var/lib/citadela",
};

describe("Connector service definitions", () => {
  it("renders a restarting, least-privilege systemd unit", () => {
    const unit = renderSystemdUnit(options);
    expect(unit).toContain("ExecStart=\"/usr/bin/node\" \"/opt/citadela/dist/cli.js\" \"connector\" \"connect\"");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(unit).toContain("Environment=CITADELA_CONFIG_DIR=\"/var/lib/citadela\"");
  });

  it("renders the Windows service command without executing it", () => {
    const command = windowsServiceCommand({ ...options, platform: "win32" });
    expect(command.slice(0, 3)).toEqual(["create", "citadela-connector", "binPath="]);
    expect(command[3]?.toLowerCase()).toBe('"c:\\windows\\system32\\cmd.exe" /d /c "c:\\programdata\\citadela\\citadela-connector.cmd"');
    expect(command.slice(4)).toEqual(["start=", "auto", "DisplayName=", "Citadela Connector"]);
    expect(renderWindowsServiceScript({ ...options, platform: "win32" })).toContain('set "CITADELA_CONFIG_DIR=/var/lib/citadela"');
  });

  it("uses native service locations", () => {
    expect(serviceFilePath("linux")).toBe("/etc/systemd/system/citadela-connector.service");
    expect(serviceFilePath("win32")).toMatch(/[\\/]Citadela[\\/]citadela-connector\.cmd$/);
  });
});
