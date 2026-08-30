import { z } from "zod";
import { DeviceIdSchema, ProtocolVersionSchema } from "../common/index.js";

export const HubHelloMessageSchema = z
  .object({
    type: z.literal("hub.hello"),
    deviceId: DeviceIdSchema,
    protocolVersion: ProtocolVersionSchema,
    sessionId: z.string().trim().min(1),
  })
  .strict();

export type HubHelloMessage = z.infer<typeof HubHelloMessageSchema>;
