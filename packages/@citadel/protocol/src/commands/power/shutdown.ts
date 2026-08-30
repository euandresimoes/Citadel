import { z } from "zod";
import { CommandIdSchema, DeviceIdSchema } from "../../common/index.js";

export const ShutdownCommandSchema = z
  .object({
    id: CommandIdSchema,
    type: z.literal("device.system.power.shutdown"),
    deviceId: DeviceIdSchema,
  })
  .strict();

export type ShutdownCommand = z.infer<typeof ShutdownCommandSchema>;
