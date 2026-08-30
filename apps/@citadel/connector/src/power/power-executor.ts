import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type PowerCommandType =
  | "device.system.power.sleep"
  | "device.system.power.restart"
  | "device.system.power.shutdown";

export interface PowerCommandExecutor {
  execute(commandType: PowerCommandType): Promise<void>;
}

export type SupportedPowerPlatform = "win32" | "linux";
export type PowerProcessRunner = (file: string, args: string[]) => Promise<void>;

const execFileAsync = promisify(execFile);

const COMMANDS: Record<SupportedPowerPlatform, Record<PowerCommandType, { file: string; args: string[] }>> = {
  win32: {
    "device.system.power.sleep": { file: "rundll32.exe", args: ["powrprof.dll,SetSuspendState", "0,1,0"] },
    "device.system.power.restart": { file: "shutdown.exe", args: ["/r", "/t", "0"] },
    "device.system.power.shutdown": { file: "shutdown.exe", args: ["/s", "/t", "0"] },
  },
  linux: {
    "device.system.power.sleep": { file: "systemctl", args: ["suspend"] },
    "device.system.power.restart": { file: "systemctl", args: ["reboot"] },
    "device.system.power.shutdown": { file: "systemctl", args: ["poweroff"] },
  },
};

export function createPowerCommandExecutor(
  platform: NodeJS.Platform = process.platform,
  run: PowerProcessRunner = async (file, args) => { await execFileAsync(file, args); },
): PowerCommandExecutor {
  if (platform !== "win32" && platform !== "linux") {
    return new UnsupportedPowerCommandExecutor(platform);
  }

  return {
    execute: async (commandType) => {
      const command = COMMANDS[platform][commandType];
      await run(command.file, command.args);
    },
  };
}

export class UnsupportedPowerCommandExecutor implements PowerCommandExecutor {
  public constructor(private readonly platform: string) {}

  public async execute(_commandType: PowerCommandType): Promise<void> {
    throw new Error(`Power commands are not supported on platform: ${this.platform}`);
  }
}
