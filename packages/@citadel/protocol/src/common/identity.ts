import { z } from "zod";

export const DeviceIdentitySchema = z
  .object({
    algorithm: z.literal("ed25519"),
    publicKey: z.string().trim().min(1),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type DeviceIdentity = z.infer<typeof DeviceIdentitySchema>;
