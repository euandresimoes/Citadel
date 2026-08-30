import { z } from "zod";
import { DeviceIdSchema, DeviceIdentitySchema } from "../common/index.js";

export const PairingPendingMessageSchema = z
  .object({
    type: z.literal("pairing.pending"),
    requestId: z.string().trim().min(1),
    deviceId: DeviceIdSchema,
    identity: DeviceIdentitySchema,
  })
  .strict();

export type PairingPendingMessage = z.infer<typeof PairingPendingMessageSchema>;
