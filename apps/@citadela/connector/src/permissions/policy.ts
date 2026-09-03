import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  PermissionLevelSchema,
  PermissionSchema,
  PERMISSIONS_BY_LEVEL,
  type Permission,
  type PermissionLevel,
} from "@citadela/protocol";

export { PermissionLevelSchema, PermissionSchema } from "@citadela/protocol";
export type { Permission, PermissionLevel } from "@citadela/protocol";

export interface DevicePermissionPolicy {
  level: PermissionLevel;
  permissions: Permission[];
}

export interface PermissionPolicyStore {
  load(): DevicePermissionPolicy | undefined;
  save(policy: DevicePermissionPolicy): void;
}

export class FilePermissionPolicyStore implements PermissionPolicyStore {
  public constructor(private readonly filePath = join(process.env.CITADELA_CONFIG_DIR ?? join(homedir(), ".citadela"), "permissions.json")) {}

  public load(): DevicePermissionPolicy | undefined {
    try {
      const value = JSON.parse(readFileSync(this.filePath, "utf8")) as { level?: unknown; permissions?: unknown };
      const level = PermissionLevelSchema.parse(value.level);
      const permissions = Array.isArray(value.permissions) ? value.permissions.map((permission) => PermissionSchema.parse(permission)) : [];
      return { level, permissions: [...new Set(permissions)] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  public save(policy: DevicePermissionPolicy): void {
    const normalized = normalizePolicy(policy);
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.tmp-${process.pid}`;
    writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, this.filePath);
    chmodSync(this.filePath, 0o600);
  }
}

export function defaultPermissionPolicy(): DevicePermissionPolicy {
  return normalizePolicy({ level: "operator", permissions: PERMISSIONS_BY_LEVEL.operator });
}

export function loadOrCreatePermissionPolicy(store: PermissionPolicyStore): DevicePermissionPolicy {
  const existing = store.load();
  if (existing) return normalizePolicy(existing);
  const created = defaultPermissionPolicy();
  store.save(created);
  return created;
}

export function policyForLevel(level: PermissionLevel): DevicePermissionPolicy {
  return normalizePolicy({ level, permissions: PERMISSIONS_BY_LEVEL[level] });
}

export function hasPermission(policy: DevicePermissionPolicy, permission: Permission): boolean {
  return policy.permissions.includes(permission);
}

function normalizePolicy(policy: DevicePermissionPolicy): DevicePermissionPolicy {
  const level = PermissionLevelSchema.parse(policy.level);
  const permissions = [...new Set(policy.permissions.map((permission) => PermissionSchema.parse(permission)))];
  return { level, permissions };
}
