import { z } from "zod";
import { ConnectionIdSchema } from "../common/index.js";

export const HubChallengeMessageSchema = z
  .object({
    type: z.literal("hub.challenge"),
    connectionId: ConnectionIdSchema,
    nonce: z.string().trim().min(1),
  })
  .strict();

export type HubChallengeMessage = z.infer<typeof HubChallengeMessageSchema>;
