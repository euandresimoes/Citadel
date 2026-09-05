import type { FileChunkAcknowledgement } from "@citadela/protocol";
import { decodeFileTransferFrame } from "./transfer-frame.js";
import { FileTransferStreamReader } from "./transfer-reader.js";

export interface FileTransferSenderOptions {
  source: FileTransferStreamReader;
  send: (frame: Buffer) => Promise<void> | void;
  onProgress?: (completedBytes: number, totalBytes: number) => void;
  onComplete?: () => void;
}

export class FileTransferSender {
  private paused = false;
  private cancelled = false;
  private pendingAck: { sequence: number; offset: number; resolve: () => void; reject: (error: Error) => void } | undefined;

  public constructor(private readonly options: FileTransferSenderOptions) {}

  public pause(): void { this.paused = true; }
  public resume(): void { this.paused = false; }
  public cancel(): void { this.cancelled = true; this.pendingAck?.reject(new Error("Transfer cancelled")); }

  public acknowledge(acknowledgement: FileChunkAcknowledgement): void {
    if (!this.pendingAck || acknowledgement.sequence !== this.pendingAck.sequence || acknowledgement.nextOffsetBytes < this.pendingAck.offset) return;
    this.pendingAck.resolve();
    this.pendingAck = undefined;
  }

  public async run(offsetBytes = 0): Promise<void> {
    for await (const entry of this.options.source.frames(offsetBytes)) {
      if (this.cancelled) throw new Error("Transfer cancelled");
      while (this.paused) await new Promise<void>((resolve) => setTimeout(resolve, 25));
      const decoded = decodeFileTransferFrame(entry.frame);
      const acknowledgement = new Promise<void>((resolve, reject) => { this.pendingAck = { sequence: decoded.header.sequence, offset: decoded.header.offsetBytes + decoded.header.byteLength, resolve, reject }; });
      await this.options.send(entry.frame);
      await acknowledgement;
      this.options.onProgress?.(decoded.header.offsetBytes + decoded.header.byteLength, this.options.source.totalBytes);
    }
    this.options.onComplete?.();
  }
}
