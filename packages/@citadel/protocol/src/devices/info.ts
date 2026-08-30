import { z } from "zod";
import { CapabilitySchema } from "../capabilities/index.js";
import { PermissionSchema } from "../permissions/index.js";
import { DevicePlatformSchema } from "./platform.js";

export const DeviceInfoSchema = z
  .object({
    hostname: z.string().trim().min(1),
    platform: DevicePlatformSchema,
    architecture: z.string().trim().min(1),
    capabilities: z.array(CapabilitySchema),
    permissions: z.array(PermissionSchema),
  })
  .strict();

export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;
