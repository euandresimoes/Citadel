import { z } from "zod";
import { ConnectionIdSchema } from "../common/index.js";

export const DeviceAuthMessageSchema = z
  .object({
    type: z.literal("device.auth"),
    connectionId: ConnectionIdSchema,
    signature: z.string().trim().min(1),
  })
  .strict();

export type DeviceAuthMessage = z.infer<typeof DeviceAuthMessageSchema>;
