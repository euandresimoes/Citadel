import { z } from "zod";

export const ProtocolVersionSchema = z.number().int().positive();
export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>;

export const PROTOCOL_VERSION = 1 as const;
