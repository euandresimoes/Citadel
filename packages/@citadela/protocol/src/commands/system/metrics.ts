import { z } from "zod";
import { CommandIdSchema, DeviceIdSchema } from "../../common/index.js";
export const SystemMetricsCommandSchema = z.object({ id: CommandIdSchema, type: z.literal("device.system.metrics.request"), deviceId: DeviceIdSchema }).strict();
export type SystemMetricsCommand = z.infer<typeof SystemMetricsCommandSchema>;
