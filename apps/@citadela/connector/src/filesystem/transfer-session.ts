import { FileTransferJobSchema, type FileChunkAcknowledgement, type FileTransferJob } from "@citadela/protocol";
import { decodeFileTransferFrame } from "./transfer-frame.js";
import { FileTransferStreamWriter, type FileTransferStreamOptions } from "./transfer-stream.js";

export class FileTransferSession {
  private readonly writer: FileTransferStreamWriter;

  public constructor(private readonly job: FileTransferJob, options: Omit<FileTransferStreamOptions, "expectedDigest">) {
    FileTransferJobSchema.parse(job);
    this.writer = new FileTransferStreamWriter({ ...options, expectedDigest: job.manifestDigest });
  }

  public async open(): Promise<void> { await this.writer.open(); }

  public async acceptFrame(frame: Uint8Array): Promise<FileChunkAcknowledgement> {
    const decoded = decodeFileTransferFrame(frame);
    if (decoded.header.transferId !== this.job.transferId) throw new Error("Chunk belongs to another transfer");
    const item = this.job.items.find((candidate) => candidate.itemId === decoded.header.itemId);
    if (!item) throw new Error("Chunk belongs to an unknown transfer item");
    const nextOffsetBytes = await this.writer.write(decoded.header, decoded.payload);
    return { transferId: this.job.transferId, itemId: decoded.header.itemId, sequence: decoded.header.sequence, nextOffsetBytes };
  }

  public async commit(): Promise<void> { await this.writer.commit(); }
  public async abort(): Promise<void> { await this.writer.abort(); }
  public async suspend(): Promise<void> { await this.writer.suspend(); }
  public get verifiedOffset(): number { return this.writer.verifiedOffset; }
}
