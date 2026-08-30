import { z } from "zod";
import { ConnectionIdSchema, DeviceIdSchema, DeviceIdentitySchema, NetworkModeSchema, ProtocolVersionSchema } from "../common/index.js";
import { DeviceInfoSchema } from "../devices/index.js";

export const DeviceHelloMessageSchema = z
  .object({
    type: z.literal("device.hello"),
    deviceId: DeviceIdSchema,
    connectionId: ConnectionIdSchema,
    networkMode: NetworkModeSchema,
    protocolVersion: ProtocolVersionSchema,
    identity: DeviceIdentitySchema,
    device: DeviceInfoSchema,
  })
  .strict();

export type DeviceHelloMessage = z.infer<typeof DeviceHelloMessageSchema>;
