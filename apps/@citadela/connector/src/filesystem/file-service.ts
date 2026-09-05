import { cp, lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, posix } from "node:path";
import type { FileItem, FileOperation } from "@citadela/protocol";
import { FileItemSchema } from "@citadela/protocol";
import { SecureFilesystem } from "./secure-filesystem.js";

type MkdirOperation = Extract<FileOperation, { type: "mkdir" }>;
type RenameOperation = Extract<FileOperation, { type: "rename" }>;
type DeleteOperation = Extract<FileOperation, { type: "delete" }>;
type CopyOperation = Extract<FileOperation, { type: "copy" }>;
type MoveOperation = Extract<FileOperation, { type: "move" }>;

export class FileOperationError extends Error {
  public constructor(
    public readonly code: "file.not_found" | "file.conflict" | "file.storage.insufficient" | "file.operation.failed",
    message: string,
  ) {
    super(message);
    this.name = "FileOperationError";
  }
}

export class ConnectorFileService extends SecureFilesystem {
  private readonly completedOperations = new Map<string, Promise<unknown>>();

  public async list(rootId: string, path: string): Promise<FileItem[]> {
    const directory = this.resolvePath(rootId, path, "list");
    const entries = await readdir(directory, { withFileTypes: true });
    this.assertItemCount(entries.length);
    const items = await Promise.all(entries.map(async (entry) => {
      const relativePath = posix.join(path.replaceAll("\\", "/"), entry.name);
      const safePath = this.resolvePath(rootId, relativePath, "read");
      return this.toFileItem(rootId, relativePath, safePath);
    }));
    return items.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  public async stat(rootId: string, path: string): Promise<FileItem> {
    const safePath = this.resolvePath(rootId, path, "read");
    return this.toFileItem(rootId, path, safePath);
  }

  public mkdir(operation: MkdirOperation): Promise<void> {
    return this.runIdempotent(operation.operationId, async () => {
      await mkdir(this.resolvePath(operation.rootId, operation.path, "write"));
    });
  }

  public rename(operation: RenameOperation): Promise<void> {
    return this.runIdempotent(operation.operationId, async () => {
      const source = this.resolvePath(operation.rootId, operation.path, "write");
      const destination = this.resolvePath(operation.rootId, posix.join(posix.dirname(operation.path), operation.newName), "write");
      await this.ensureDestinationDoesNotExist(destination);
      await rename(source, destination);
    });
  }

  public delete(operation: DeleteOperation): Promise<void> {
    return this.runIdempotent(operation.operationId, async () => {
      const target = this.resolvePath(operation.rootId, operation.path, "delete");
      const details = await lstat(target);
      if (details.isDirectory() && !operation.recursive) {
        throw new FileOperationError("file.operation.failed", "Directory deletion requires recursive confirmation");
      }
      await rm(target, { recursive: operation.recursive, force: false });
    });
  }

  public copy(operation: CopyOperation): Promise<void> {
    return this.runIdempotent(operation.operationId, () => this.copyInternal(operation));
  }

  public move(operation: MoveOperation): Promise<void> {
    return this.runIdempotent(operation.operationId, async () => {
      const source = this.resolvePath(operation.rootId, operation.path, "read");
      const destination = this.resolvePath(operation.destinationRootId, operation.destinationPath, "write");
      await this.ensureDestinationDoesNotExist(destination);
      if (operation.rootId === operation.destinationRootId) {
        await rename(source, destination);
        return;
      }
      await this.copyInternal({ ...operation, type: "copy" });
      await rm(this.resolvePath(operation.rootId, operation.path, "delete"), { recursive: true, force: false });
    });
  }

  private async copyInternal(operation: CopyOperation): Promise<void> {
    const source = this.resolvePath(operation.rootId, operation.path, "read");
    const destination = this.resolvePath(operation.destinationRootId, operation.destinationPath, "write");
    await this.ensureDestinationDoesNotExist(destination);
    const temporaryDestination = `${destination}.citadela-copy-${operation.operationId}`;
    try {
      await cp(source, temporaryDestination, { recursive: true, force: false, errorOnExist: true });
      await rename(temporaryDestination, destination);
    } catch (error) {
      await rm(temporaryDestination, { recursive: true, force: true }).catch(() => undefined);
      throw this.translateError(error);
    }
  }

  private async toFileItem(rootId: string, relativePath: string, safePath: string): Promise<FileItem> {
    const details = await lstat(safePath);
    this.assertFileSize(details.size);
    return FileItemSchema.parse({
      itemId: `${rootId}:${relativePath}`,
      relativePath,
      type: details.isDirectory() ? "directory" : details.isSymbolicLink() ? "symlink" : "file",
      sizeBytes: details.size,
      modifiedAt: details.mtime.toISOString(),
      mode: details.mode,
    });
  }

  private async ensureDestinationDoesNotExist(destination: string): Promise<void> {
    try {
      await lstat(destination);
      throw new FileOperationError("file.conflict", `Destination already exists: ${basename(destination)}`);
    } catch (error) {
      if (error instanceof FileOperationError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw this.translateError(error);
    }
    await mkdir(dirname(destination), { recursive: false }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw this.translateError(error);
    });
  }

  private runIdempotent<T>(operationId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.completedOperations.get(operationId);
    if (previous) return previous as Promise<T>;
    const current = action();
    this.completedOperations.set(operationId, current);
    return current.catch((error: unknown) => {
      this.completedOperations.delete(operationId);
      throw error;
    });
  }

  private translateError(error: unknown): FileOperationError {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return new FileOperationError("file.not_found", "Filesystem item was not found");
    if (code === "ENOSPC") return new FileOperationError("file.storage.insufficient", "Insufficient storage space");
    if (code === "EEXIST") return new FileOperationError("file.conflict", "Destination already exists");
    return new FileOperationError("file.operation.failed", error instanceof Error ? error.message : "Filesystem operation failed");
  }
}
