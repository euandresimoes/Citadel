import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { FileChunkHeader } from "@citadela/protocol";

export interface FileTransferStreamOptions {
  temporaryPath: string;
  destinationPath: string;
  expectedDigest: string;
  maxChunkBytes?: number;
  replaceExisting?: boolean;
  resumeOffset?: number;
}

export class FileTransferStreamError extends Error {
  public constructor(message: string) { super(message); this.name = "FileTransferStreamError"; }
}

/** Sequential, bounded-memory receiver. The destination is never touched before commit(). */
export class FileTransferStreamWriter {
  private readonly maxChunkBytes: number;
  private readonly digest = createHash("sha256");
  private handle: Awaited<ReturnType<typeof open>> | undefined;
  private nextOffset = 0;
  private closed = false;

  public constructor(private readonly options: FileTransferStreamOptions) {
    this.maxChunkBytes = options.maxChunkBytes ?? 16 * 1024 * 1024;
  }

  public async open(): Promise<void> {
    if (this.handle) return;
    await mkdir(dirname(this.options.temporaryPath), { recursive: true });
    const existing = await stat(this.options.temporaryPath).catch(() => undefined);
    const resumeOffset = this.options.resumeOffset ?? 0;
    if (resumeOffset > 0) {
      if (!existing?.isFile() || existing.size !== resumeOffset) throw new FileTransferStreamError("Transfer checkpoint does not match temporary data");
      for await (const chunk of createReadStream(this.options.temporaryPath, { highWaterMark: Math.min(this.maxChunkBytes, 1024 * 1024) })) this.digest.update(chunk);
      this.nextOffset = resumeOffset;
      this.handle = await open(this.options.temporaryPath, "a");
      return;
    }
    if (existing) await rm(this.options.temporaryPath, { force: true });
    this.handle = await open(this.options.temporaryPath, "w");
  }

  public get verifiedOffset(): number { return this.nextOffset; }

  public async write(header: FileChunkHeader, chunk: Uint8Array): Promise<number> {
    if (this.closed || !this.handle) throw new FileTransferStreamError("Transfer stream is not open");
    if (chunk.byteLength !== header.byteLength || chunk.byteLength > this.maxChunkBytes) throw new FileTransferStreamError("Invalid transfer chunk length");
    if (header.offsetBytes !== this.nextOffset) throw new FileTransferStreamError(`Expected chunk offset ${this.nextOffset}, received ${header.offsetBytes}`);
    const chunkDigest = createHash("sha256").update(chunk).digest("hex");
    if (chunkDigest.toLowerCase() !== header.digest.toLowerCase()) throw new FileTransferStreamError("Transfer chunk digest mismatch");
    await this.handle.write(chunk, 0, chunk.byteLength, this.nextOffset);
    this.digest.update(chunk);
    this.nextOffset += chunk.byteLength;
    return this.nextOffset;
  }

  public async commit(): Promise<void> {
    if (this.closed || !this.handle) throw new FileTransferStreamError("Transfer stream is not open");
    const digest = this.digest.digest("hex");
    if (digest.toLowerCase() !== this.options.expectedDigest.toLowerCase()) throw new FileTransferStreamError("Complete transfer digest mismatch");
    await this.handle.sync();
    await this.handle.close();
    this.handle = undefined;
    await mkdir(dirname(this.options.destinationPath), { recursive: true });
    if (this.options.replaceExisting) await rm(this.options.destinationPath, { recursive: true, force: true });
    await rename(this.options.temporaryPath, this.options.destinationPath);
    this.closed = true;
  }

  public async abort(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.handle) { await this.handle.close(); this.handle = undefined; }
    await rm(this.options.temporaryPath, { force: true });
  }

  public async suspend(): Promise<void> {
    if (this.closed || !this.handle) return;
    await this.handle.close();
    this.handle = undefined;
  }

  public async resumeOffset(): Promise<number> {
    const existing = await stat(this.options.temporaryPath).catch(() => undefined);
    return existing?.isFile() ? existing.size : 0;
  }
}
