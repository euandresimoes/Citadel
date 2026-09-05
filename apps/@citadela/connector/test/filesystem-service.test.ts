import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConnectorFileService } from "../src/filesystem/index.js";

const directories: string[] = [];

async function createService(): Promise<{ service: ConnectorFileService; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "citadela-file-service-"));
  directories.push(root);
  return {
    root,
    service: new ConnectorFileService([{ rootId: "root-01", name: "Workspace", path: root }]),
  };
}

async function createTwoRootService(): Promise<{ service: ConnectorFileService; sourceRoot: string; destinationRoot: string }> {
  const sourceRoot = await mkdtemp(join(tmpdir(), "citadela-file-source-"));
  const destinationRoot = await mkdtemp(join(tmpdir(), "citadela-file-destination-"));
  directories.push(sourceRoot, destinationRoot);
  return {
    sourceRoot,
    destinationRoot,
    service: new ConnectorFileService([
      { rootId: "source", name: "Source", path: sourceRoot },
      { rootId: "destination", name: "Destination", path: destinationRoot },
    ]),
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ConnectorFileService", () => {
  it("lists directories and returns file metadata", async () => {
    const { service, root } = await createService();
    await mkdir(join(root, "projects"));
    await writeFile(join(root, "projects", "readme.md"), "hello");

    const items = await service.list("root-01", "projects");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ relativePath: "projects/readme.md", type: "file", sizeBytes: 5 });
    await expect(service.stat("root-01", "projects/readme.md")).resolves.toMatchObject({ type: "file", sizeBytes: 5 });
  });

  it("creates and renames directories", async () => {
    const { service, root } = await createService();

    await service.mkdir({ operationId: "mkdir-01", deviceId: "device-a", rootId: "root-01", path: "workspace" });
    await service.rename({ operationId: "rename-01", deviceId: "device-a", rootId: "root-01", path: "workspace", newName: "renamed" });

    await expect(stat(join(root, "renamed"))).resolves.toBeTruthy();
  });

  it("copies and moves files without exposing partial destination files", async () => {
    const { service, root } = await createService();
    await mkdir(join(root, "destination"));
    await writeFile(join(root, "source.txt"), "content");

    await service.copy({ operationId: "copy-01", deviceId: "device-a", rootId: "root-01", path: "source.txt", destinationRootId: "root-01", destinationPath: "destination/copied.txt" });
    await expect(readFile(join(root, "destination", "copied.txt"), "utf8")).resolves.toBe("content");

    await service.move({ operationId: "move-01", deviceId: "device-a", rootId: "root-01", path: "source.txt", destinationRootId: "root-01", destinationPath: "destination/moved.txt" });
    await expect(readFile(join(root, "destination", "moved.txt"), "utf8")).resolves.toBe("content");
    await expect(stat(join(root, "source.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires recursive deletion for directories and supports idempotency", async () => {
    const { service, root } = await createService();
    await mkdir(join(root, "folder"));
    await writeFile(join(root, "folder", "file.txt"), "content");

    await expect(service.delete({ operationId: "delete-01", deviceId: "device-a", rootId: "root-01", path: "folder", recursive: false })).rejects.toThrow();
    await service.delete({ operationId: "delete-01", deviceId: "device-a", rootId: "root-01", path: "folder", recursive: true });
    await expect(stat(join(root, "folder"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(service.delete({ operationId: "delete-01", deviceId: "device-a", rootId: "root-01", path: "folder", recursive: true })).resolves.toBeUndefined();
  });

  it("moves across roots only after copying and committing the destination", async () => {
    const { service, sourceRoot, destinationRoot } = await createTwoRootService();
    await writeFile(join(sourceRoot, "source.txt"), "content");

    await service.move({ operationId: "move-cross-root-01", deviceId: "device-a", rootId: "source", path: "source.txt", destinationRootId: "destination", destinationPath: "moved.txt" });

    await expect(readFile(join(destinationRoot, "moved.txt"), "utf8")).resolves.toBe("content");
    await expect(stat(join(sourceRoot, "source.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
