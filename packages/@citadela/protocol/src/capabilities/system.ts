import { z } from "zod";

export const CapabilitySchema = z.enum([
  "capability.system.info",
  "capability.system.metrics",
  "capability.system.power.restart",
  "capability.system.power.shutdown",
  "capability.system.power.sleep",
  "capability.system.power.wake",
  "capability.system.terminal",
]);

export type Capability = z.infer<typeof CapabilitySchema>;
