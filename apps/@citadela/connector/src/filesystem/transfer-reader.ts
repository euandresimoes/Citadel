import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { FileChunkHeaderSchema } from "@citadela/protocol";
import { encodeFileTransferFrame } from "./transfer-frame.js";

export interface FileTransferReaderOptions {
  filePath: string;
  transferId: string;
  itemId: string;
  chunkBytes?: number;
}

export class FileTransferStreamReader {
  private readonly chunkBytes: number;
  private readonly size: number;

  private constructor(private readonly options: FileTransferReaderOptions, size: number) {
    this.size = size;
    this.chunkBytes = Math.min(Math.max(options.chunkBytes ?? 1024 * 1024, 1), 16 * 1024 * 1024);
  }

  public static async open(options: FileTransferReaderOptions): Promise<FileTransferStreamReader> {
    const metadata = await stat(options.filePath);
    if (!metadata.isFile()) throw new Error("Transfer source must be a regular file");
    return new FileTransferStreamReader(options, metadata.size);
  }

  public get totalBytes(): number { return this.size; }

  public async *frames(offsetBytes = 0): AsyncGenerator<{ frame: Buffer; sequence: number; offsetBytes: number }, void, void> {
    if (!Number.isSafeInteger(offsetBytes) || offsetBytes < 0 || offsetBytes > this.size) throw new Error("Invalid transfer resume offset");
    const handle = await open(this.options.filePath, "r");
    try {
      let offset = offsetBytes;
      let sequence = Math.floor(offset / this.chunkBytes);
      while (offset < this.size) {
        const length = Math.min(this.chunkBytes, this.size - offset);
        const payload = Buffer.allocUnsafe(length);
        const result = await handle.read(payload, 0, length, offset);
        if (result.bytesRead !== length) throw new Error("Transfer source changed while reading");
        const header = FileChunkHeaderSchema.parse({ transferId: this.options.transferId, itemId: this.options.itemId, sequence, offsetBytes: offset, byteLength: length, digest: createHash("sha256").update(payload).digest("hex") });
        yield { frame: encodeFileTransferFrame(header, payload), sequence, offsetBytes: offset };
        offset += length;
        sequence += 1;
      }
    } finally { await handle.close(); }
  }
}
