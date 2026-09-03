import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilePermissionPolicyStore, hasPermission, loadOrCreatePermissionPolicy, policyForLevel } from "../src/permissions/policy.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("device permission policy", () => {
  it("creates a least-privilege default operator policy", () => {
    const directory = mkdtempSync(join(tmpdir(), "citadela-permissions-"));
    directories.push(directory);
    const policy = loadOrCreatePermissionPolicy(new FilePermissionPolicyStore(join(directory, "permissions.json")));
    expect(policy.level).toBe("operator");
    expect(hasPermission(policy, "permission.system.power.restart")).toBe(true);
    expect(hasPermission(policy, "permission.system.terminal.use")).toBe(false);
  });

  it("persists full-control policy without secrets", () => {
    const directory = mkdtempSync(join(tmpdir(), "citadela-permissions-"));
    directories.push(directory);
    const path = join(directory, "permissions.json");
    const store = new FilePermissionPolicyStore(path);
    store.save(policyForLevel("full-control"));
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ level: "full-control" });
    expect(readFileSync(path, "utf8")).not.toContain("privateKey");
  });
});
