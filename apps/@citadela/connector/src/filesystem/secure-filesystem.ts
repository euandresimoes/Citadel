import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { FileRootSchema, type FileRoot } from "@citadela/protocol";
import type { Permission } from "@citadela/protocol";

export type FilesystemOperation = "list" | "read" | "write" | "delete";

export interface AllowedFilesystemRoot {
  rootId: string;
  name: string;
  path: string;
  readOnly?: boolean;
}

export interface SecureFilesystemOptions {
  maxDirectoryDepth?: number;
  maxFileSizeBytes?: number;
  maxItemsPerOperation?: number;
  temporaryDirectory?: string;
  canPerform?: (operation: FilesystemOperation) => boolean;
}

interface ResolvedRoot {
  definition: AllowedFilesystemRoot;
  realPath: string;
}

export class FileSystemSecurityError extends Error {
  public constructor(
    public readonly code: "root.not_allowed" | "path.invalid" | "permission.denied" | "limit.exceeded",
    message: string,
  ) {
    super(message);
    this.name = "FileSystemSecurityError";
  }
}

export class SecureFilesystem {
  private readonly roots: Map<string, ResolvedRoot>;
  private readonly options: Required<Pick<SecureFilesystemOptions, "maxDirectoryDepth" | "maxFileSizeBytes" | "maxItemsPerOperation">> & SecureFilesystemOptions;

  public constructor(
    roots: readonly AllowedFilesystemRoot[],
    options: SecureFilesystemOptions = {},
  ) {
    this.options = {
      maxDirectoryDepth: options.maxDirectoryDepth ?? 32,
      maxFileSizeBytes: options.maxFileSizeBytes ?? 10 * 1024 * 1024 * 1024,
      maxItemsPerOperation: options.maxItemsPerOperation ?? 1_000_000,
      ...options,
    };
    this.roots = new Map(roots.map((root) => {
      if (!existsSync(root.path)) {
        throw new FileSystemSecurityError("root.not_allowed", `Filesystem root does not exist: ${root.rootId}`);
      }
      const realPath = realpathSync(root.path);
      return [root.rootId, { definition: { ...root, path: realPath }, realPath }] as const;
    }));
  }

  public listRoots(): FileRoot[] {
    return [...this.roots.values()].map(({ definition }) => FileRootSchema.parse({
      rootId: definition.rootId,
      name: definition.name,
      path: definition.path,
      readOnly: definition.readOnly ?? false,
    }));
  }

  public resolvePath(rootId: string, relativePath: string, operation: FilesystemOperation): string {
    const root = this.roots.get(rootId);
    if (!root) throw new FileSystemSecurityError("root.not_allowed", `Unknown filesystem root: ${rootId}`);
    this.assertOperationAllowed(root.definition, operation);
    if (this.options.canPerform && !this.options.canPerform(operation)) {
      throw new FileSystemSecurityError("permission.denied", `Filesystem operation is denied by local policy: ${operation}`);
    }

    if (!relativePath || relativePath.includes("\0") || isAbsolute(relativePath) || /^[a-z]:[\\/]/iu.test(relativePath)) {
      throw new FileSystemSecurityError("path.invalid", "Filesystem path must be relative to an allowed root");
    }
    const segments = relativePath.split(/[\\/]+/u);
    if (segments.includes("..") || segments.length > this.options.maxDirectoryDepth) {
      throw new FileSystemSecurityError("path.invalid", "Filesystem path escapes the allowed root or exceeds its depth limit");
    }

    const candidate = resolve(root.realPath, ...segments);
    this.assertWithinRoot(root.realPath, candidate);

    let existingPath = candidate;
    const missingSegments: string[] = [];
    while (!existsSync(existingPath)) {
      const parent = dirname(existingPath);
      if (parent === existingPath) break;
      missingSegments.unshift(existingPath.slice(parent.length + 1));
      existingPath = parent;
    }
    if (!existsSync(existingPath)) {
      throw new FileSystemSecurityError("path.invalid", "Filesystem path has no valid existing ancestor");
    }

    this.assertWithinRoot(root.realPath, realpathSync(existingPath));
    const resolved = missingSegments.reduce((current, segment) => join(current, segment), realpathSync(existingPath));
    this.assertWithinRoot(root.realPath, resolved);
    return resolved;
  }

  public assertFileSize(sizeBytes: number): void {
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > this.options.maxFileSizeBytes) {
      throw new FileSystemSecurityError("limit.exceeded", "File exceeds the configured size limit");
    }
  }

  public assertItemCount(itemCount: number): void {
    if (!Number.isSafeInteger(itemCount) || itemCount < 0 || itemCount > this.options.maxItemsPerOperation) {
      throw new FileSystemSecurityError("limit.exceeded", "Operation exceeds the configured item limit");
    }
  }

  public async createTemporaryDirectory(): Promise<string> {
    const writableRoot = [...this.roots.values()].find(({ definition }) => !definition.readOnly);
    if (!writableRoot) throw new FileSystemSecurityError("permission.denied", "No writable filesystem root is configured");
    const parent = this.options.temporaryDirectory ?? join(writableRoot.realPath, ".citadela-transfers");
    await mkdir(parent, { recursive: true, mode: 0o700 });
    return mkdtemp(join(parent, "transfer-"));
  }

  private assertOperationAllowed(root: AllowedFilesystemRoot, operation: FilesystemOperation): void {
    if (root.readOnly && (operation === "write" || operation === "delete")) {
      throw new FileSystemSecurityError("permission.denied", `Filesystem root is read-only: ${root.rootId}`);
    }
  }

  private assertWithinRoot(rootPath: string, candidate: string): void {
    const root = resolve(rootPath);
    const normalizedCandidate = resolve(candidate);
    const relativePath = relative(root, normalizedCandidate);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new FileSystemSecurityError("path.invalid", "Filesystem path escapes the allowed root");
    }
  }
}

export function filesystemPermission(operation: FilesystemOperation): Permission {
  switch (operation) {
    case "list": return "permission.filesystem.list";
    case "read": return "permission.filesystem.read";
    case "write": return "permission.filesystem.write";
    case "delete": return "permission.filesystem.delete";
  }
}

export function defaultFilesystemRoot(): AllowedFilesystemRoot {
  return { rootId: "home", name: "Home", path: homedir() };
}
