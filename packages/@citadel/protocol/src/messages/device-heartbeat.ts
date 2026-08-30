import { z } from "zod";
import { DeviceIdSchema } from "../common/index.js";

export const DeviceHeartbeatMessageSchema = z
  .object({
    type: z.literal("device.heartbeat"),
    deviceId: DeviceIdSchema,
    timestamp: z.number().int().nonnegative().finite(),
  })
  .strict();

export type DeviceHeartbeatMessage = z.infer<
  typeof DeviceHeartbeatMessageSchema
>;
