import { z } from "zod";

export const ProtocolErrorCodeSchema = z.enum([
  "protocol.invalid_message",
  "protocol.unsupported_version",
  "protocol.unauthorized",
]);

export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>;

export const ProtocolErrorMessageSchema = z
  .object({
    type: z.literal("protocol.error"),
    code: ProtocolErrorCodeSchema,
    message: z.string().trim().min(1),
  })
  .strict();

export type ProtocolErrorMessage = z.infer<typeof ProtocolErrorMessageSchema>;
