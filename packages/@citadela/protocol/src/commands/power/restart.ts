import { z } from "zod";
import { CommandIdSchema, DeviceIdSchema } from "../../common/index.js";

export const RestartCommandSchema = z
  .object({
    id: CommandIdSchema,
    type: z.literal("device.system.power.restart"),
    deviceId: DeviceIdSchema,
  })
  .strict();

export type RestartCommand = z.infer<typeof RestartCommandSchema>;
