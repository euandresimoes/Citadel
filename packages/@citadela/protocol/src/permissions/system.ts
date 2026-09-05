import { z } from "zod";

export const PermissionSchema = z.enum([
  "permission.system.info.read",
  "permission.system.metrics.read",
  "permission.system.power.restart",
  "permission.system.power.shutdown",
  "permission.system.power.sleep",
  "permission.system.power.wake",
  "permission.system.terminal.use",
  "permission.filesystem.list",
  "permission.filesystem.read",
  "permission.filesystem.write",
  "permission.filesystem.delete",
]);

export type Permission = z.infer<typeof PermissionSchema>;

export const PermissionLevelSchema = z.enum(["restricted", "operator", "full-control"]);
export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

export const PermissionSetSchema = z.array(PermissionSchema).max(32);
export type PermissionSet = z.infer<typeof PermissionSetSchema>;

export const PERMISSIONS_BY_LEVEL: Record<PermissionLevel, Permission[]> = {
  restricted: ["permission.system.info.read", "permission.system.metrics.read"],
  operator: [
    "permission.system.info.read",
    "permission.system.metrics.read",
    "permission.system.power.restart",
    "permission.system.power.shutdown",
    "permission.system.power.sleep",
    "permission.filesystem.list",
    "permission.filesystem.read",
  ],
  "full-control": [
    "permission.system.info.read",
    "permission.system.metrics.read",
    "permission.system.power.restart",
    "permission.system.power.shutdown",
    "permission.system.power.sleep",
    "permission.system.power.wake",
    "permission.system.terminal.use",
    "permission.filesystem.list",
    "permission.filesystem.read",
    "permission.filesystem.write",
    "permission.filesystem.delete",
  ],
};
