import { z } from "zod";
import { CommandIdSchema, DeviceIdSchema } from "../../common/index.js";

export const ShellCommandSchema = z.object({
  id: CommandIdSchema,
  type: z.literal("device.system.shell.execute"),
  deviceId: DeviceIdSchema,
  executable: z.string().trim().min(1).max(256),
  args: z.array(z.string().max(4096)).max(128),
  cwd: z.string().trim().min(1).max(4096).optional(),
  timeoutMs: z.number().int().min(100).max(300_000).default(30_000),
}).strict();

export type ShellCommand = z.infer<typeof ShellCommandSchema>;
