import { z } from "zod";

export const SystemMetricsSchema = z.object({ cpuLoadPercent: z.number().min(0).max(100), memoryUsedBytes: z.number().int().nonnegative(), memoryTotalBytes: z.number().int().positive(), collectedAt: z.string().datetime() }).strict();
export type SystemMetrics = z.infer<typeof SystemMetricsSchema>;
