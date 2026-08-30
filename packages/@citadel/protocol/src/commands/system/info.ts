import { z } from "zod";
import { CommandIdSchema, DeviceIdSchema } from "../../common/index.js";

export const SystemInfoCommandSchema = z
  .object({
    id: CommandIdSchema,
    type: z.literal("device.system.info.request"),
    deviceId: DeviceIdSchema,
  })
  .strict();

export type SystemInfoCommand = z.infer<typeof SystemInfoCommandSchema>;
