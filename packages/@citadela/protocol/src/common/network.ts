import { z } from "zod";

export const NetworkModeSchema = z.enum(["lan", "headscale"]);
export type NetworkMode = z.infer<typeof NetworkModeSchema>;

export const ConnectionIdSchema = z.string().trim().min(1);
export type ConnectionId = z.infer<typeof ConnectionIdSchema>;
