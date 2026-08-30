import { z } from "zod";
import { ConnectionIdSchema, DeviceIdSchema, NetworkModeSchema, ProtocolVersionSchema } from "../common/index.js";

export const HubHelloMessageSchema = z
  .object({
    type: z.literal("hub.hello"),
    deviceId: DeviceIdSchema,
    connectionId: ConnectionIdSchema,
    networkMode: NetworkModeSchema,
    protocolVersion: ProtocolVersionSchema,
    sessionId: z.string().trim().min(1),
  })
  .strict();

export type HubHelloMessage = z.infer<typeof HubHelloMessageSchema>;
