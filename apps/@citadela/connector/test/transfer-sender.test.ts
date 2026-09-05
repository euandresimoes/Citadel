import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileTransferStreamReader } from "../src/filesystem/transfer-reader.js";
import { decodeFileTransferFrame } from "../src/filesystem/transfer-frame.js";
import { FileTransferSender } from "../src/filesystem/transfer-sender.js";

describe("FileTransferSender", () => {
  it("sends one bounded frame at a time and resumes from acknowledgements", async () => {
    const root = await mkdtemp(join(tmpdir(), "citadela-sender-"));
    const path = join(root, "source");
    await writeFile(path, Buffer.from("0123456789"));
    const source = await FileTransferStreamReader.open({ filePath: path, transferId: "transfer", itemId: "item", chunkBytes: 5 });
    const sent: Buffer[] = [];
    const progress: number[] = [];
    const sender = new FileTransferSender({ source, send: (frame) => { sent.push(frame); const header = decodeFileTransferFrame(frame).header; queueMicrotask(() => sender.acknowledge({ transferId: "transfer", itemId: "item", sequence: header.sequence, nextOffsetBytes: header.offsetBytes + header.byteLength })); }, onProgress: (completed) => progress.push(completed) });
    await sender.run();
    expect(sent).toHaveLength(2);
    expect(progress).toEqual([5, 10]);
    const resumed: Buffer[] = [];
    const resumeSender = new FileTransferSender({ source, send: (frame) => { resumed.push(frame); const header = decodeFileTransferFrame(frame).header; queueMicrotask(() => resumeSender.acknowledge({ transferId: "transfer", itemId: "item", sequence: header.sequence, nextOffsetBytes: 10 })); } });
    await resumeSender.run(5);
    expect(resumed).toHaveLength(1);
  });

  it("does not bypass an outstanding acknowledgement when resumed", async () => {
    const root = await mkdtemp(join(tmpdir(), "citadela-sender-pause-"));
    const path = join(root, "source");
    await writeFile(path, Buffer.from("0123456789"));
    const source = await FileTransferStreamReader.open({ filePath: path, transferId: "transfer", itemId: "item", chunkBytes: 5 });
    let sender!: FileTransferSender;
    const sent: Buffer[] = [];
    let completed = false;
    sender = new FileTransferSender({ source, send: (frame) => { sent.push(frame); }, onComplete: () => { completed = true; } });
    const run = sender.run();
    await expect.poll(() => sent).toHaveLength(1);
    sender.pause();
    sender.resume();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(completed).toBe(false);
    const header = decodeFileTransferFrame(sent[0]!).header;
    sender.acknowledge({ transferId: "transfer", itemId: "item", sequence: header.sequence, nextOffsetBytes: 5 });
    await expect.poll(() => sent).toHaveLength(2);
    const secondHeader = decodeFileTransferFrame(sent[1]!).header;
    sender.acknowledge({ transferId: "transfer", itemId: "item", sequence: secondHeader.sequence, nextOffsetBytes: 10 });
    await run;
    expect(completed).toBe(true);
  });
});
