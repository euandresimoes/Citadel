import { z } from "zod";

export const PermissionSchema = z.enum([
  "permission.system.info.read",
  "permission.system.metrics.read",
  "permission.system.power.restart",
  "permission.system.power.shutdown",
  "permission.system.power.sleep",
  "permission.system.power.wake",
  "permission.system.terminal.use",
]);

export type Permission = z.infer<typeof PermissionSchema>;
