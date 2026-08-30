import { z } from "zod";
import { DevicePlatformSchema } from "./platform.js";

export const SystemInfoSchema = z
  .object({
    hostname: z.string().trim().min(1),
    platform: DevicePlatformSchema,
    architecture: z.string().trim().min(1),
    cpuCount: z.number().int().positive(),
    memoryBytes: z.number().int().nonnegative(),
    uptimeSeconds: z.number().int().nonnegative(),
  })
  .strict();

export type SystemInfo = z.infer<typeof SystemInfoSchema>;
