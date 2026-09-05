import type { FileTransferJob } from "@citadela/protocol";
import { FileTransferSession } from "./transfer-session.js";

export interface MultiTransferPaths { temporaryPath(itemId: string): string; destinationPath(relativePath: string): string; }

export class MultiFileTransferSession {
  private readonly sessions: Map<string, FileTransferSession>;
  private readonly job: FileTransferJob;

  public constructor(job: FileTransferJob, paths: MultiTransferPaths) {
    this.job = job;
    this.sessions = new Map(job.items.map((item) => [item.itemId, new FileTransferSession({ ...job, items: [item], totalBytes: item.sizeBytes, completedBytes: 0, manifestDigest: item.digest ?? job.manifestDigest }, { temporaryPath: paths.temporaryPath(item.itemId), destinationPath: paths.destinationPath(item.relativePath) })]));
    if (this.sessions.size !== job.items.length || job.items.length === 0) throw new Error("A multi-file transfer requires unique items");
  }

  public async open(): Promise<void> { await Promise.all([...this.sessions.values()].map((session) => session.open())); }
  public async acceptFrame(frame: Uint8Array): Promise<ReturnType<FileTransferSession["acceptFrame"]>> {
    const { decodeFileTransferFrame } = await import("./transfer-frame.js");
    const decoded = decodeFileTransferFrame(frame);
    const session = this.sessions.get(decoded.header.itemId);
    if (!session) throw new Error("Chunk belongs to an unknown transfer item");
    return session.acceptFrame(frame);
  }
  public async commit(): Promise<void> { for (const session of this.sessions.values()) await session.commit(); }
  public async abort(): Promise<void> { await Promise.all([...this.sessions.values()].map((session) => session.abort())); }
}
