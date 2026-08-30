import { z } from "zod";
import { DeviceIdSchema, ProtocolVersionSchema } from "../common/index.js";
import { DeviceInfoSchema } from "../devices/index.js";

export const DeviceHelloMessageSchema = z
  .object({
    type: z.literal("device.hello"),
    deviceId: DeviceIdSchema,
    protocolVersion: ProtocolVersionSchema,
    device: DeviceInfoSchema,
  })
  .strict();

export type DeviceHelloMessage = z.infer<typeof DeviceHelloMessageSchema>;
