import { describe, expect, it } from "vitest";
import { createPowerCommandExecutor } from "../src/index.js";

describe("power command executor", () => {
  it.each([
    ["win32", "device.system.power.sleep", "rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]],
    ["win32", "device.system.power.restart", "shutdown.exe", ["/r", "/t", "0"]],
    ["win32", "device.system.power.shutdown", "shutdown.exe", ["/s", "/t", "0"]],
    ["linux", "device.system.power.sleep", "systemctl", ["suspend"]],
    ["linux", "device.system.power.restart", "systemctl", ["reboot"]],
    ["linux", "device.system.power.shutdown", "systemctl", ["poweroff"]],
  ])("maps %s %s to the platform command", async (platform, type, file, args) => {
    let received: { file: string; args: string[] } | undefined;
    const executor = createPowerCommandExecutor(platform as NodeJS.Platform, async (command, commandArgs) => {
      received = { file: command, args: commandArgs };
    });

    await executor.execute(type as never);
    expect(received).toEqual({ file, args });
  });

  it("keeps unsupported platforms behind an explicit future-provider boundary", async () => {
    await expect(createPowerCommandExecutor("darwin").execute("device.system.power.sleep"))
      .rejects.toThrow("not supported on platform: darwin");
  });
});
