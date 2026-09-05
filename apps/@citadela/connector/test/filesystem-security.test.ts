import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileSystemSecurityError,
  filesystemPermission,
  SecureFilesystem,
} from "../src/filesystem/index.js";

const temporaryDirectories: string[] = [];

async function createRoot(): Promise<string> {
  const testRoot = process.env.CITADELA_TEST_ROOT ?? tmpdir();
  const root = await mkdtemp(join(testRoot, "citadela-filesystem-"));
  temporaryDirectories.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SecureFilesystem", () => {
  it("discovers configured roots and resolves safe relative paths", async () => {
    const root = await createRoot();
    const filesystem = new SecureFilesystem([{ rootId: "root-01", name: "Workspace", path: root }]);

    expect(filesystem.listRoots()).toMatchObject([{ rootId: "root-01", name: "Workspace" }]);
    expect(filesystem.resolvePath("root-01", "projects/app.yml", "read")).toBe(join(root, "projects", "app.yml"));
  });

  it("rejects traversal and absolute paths", async () => {
    const root = await createRoot();
    const filesystem = new SecureFilesystem([{ rootId: "root-01", name: "Workspace", path: root }]);

    for (const path of ["../secret", "/etc/passwd", "C:\\Windows\\system32"]) {
      expect(() => filesystem.resolvePath("root-01", path, "read")).toThrow(FileSystemSecurityError);
    }
  });

  it("rejects symlink escapes from an allowed root", async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "linked-outside"), "junction");
    const filesystem = new SecureFilesystem([{ rootId: "root-01", name: "Workspace", path: root }]);

    expect(() => filesystem.resolvePath("root-01", "linked-outside/secret.txt", "read")).toThrow(FileSystemSecurityError);
  });

  it("enforces read-only roots and operation limits", async () => {
    const root = await createRoot();
    await mkdir(join(root, "a", "b"), { recursive: true });
    const filesystem = new SecureFilesystem([
      { rootId: "read-only", name: "Read only", path: root, readOnly: true },
    ], { maxDirectoryDepth: 1, maxFileSizeBytes: 10 });

    expect(() => filesystem.resolvePath("read-only", "a/b/file.txt", "write")).toThrow(FileSystemSecurityError);
    expect(() => filesystem.resolvePath("read-only", "a/b/file.txt", "read")).toThrow(FileSystemSecurityError);
    expect(() => filesystem.assertFileSize(11)).toThrow(FileSystemSecurityError);
  });

  it("creates a private temporary directory for transfer state", async () => {
    const root = await createRoot();
    const filesystem = new SecureFilesystem([{ rootId: "root-01", name: "Workspace", path: root }]);
    const temporaryPath = await filesystem.createTemporaryDirectory();

    expect(temporaryPath.startsWith(root)).toBe(true);
  });

  it("maps filesystem operations to dedicated local permissions", () => {
    expect(filesystemPermission("list")).toBe("permission.filesystem.list");
    expect(filesystemPermission("read")).toBe("permission.filesystem.read");
    expect(filesystemPermission("write")).toBe("permission.filesystem.write");
    expect(filesystemPermission("delete")).toBe("permission.filesystem.delete");
  });
});
