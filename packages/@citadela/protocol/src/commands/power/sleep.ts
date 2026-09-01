import { z } from "zod";
import { CommandIdSchema, DeviceIdSchema } from "../../common/index.js";

export const SleepCommandSchema = z
  .object({
    id: CommandIdSchema,
    type: z.literal("device.system.power.sleep"),
    deviceId: DeviceIdSchema,
  })
  .strict();

export type SleepCommand = z.infer<typeof SleepCommandSchema>;
