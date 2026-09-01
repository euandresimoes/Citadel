import { z } from "zod";

export const DevicePlatformSchema = z.enum([
  "device.platform.windows",
  "device.platform.linux",
  "device.platform.macos",
]);

export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;
