import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileTransferStreamError, FileTransferStreamWriter } from "../src/filesystem/transfer-stream.js";
import { FileTransferSession } from "../src/filesystem/transfer-session.js";

describe("FileTransferStreamWriter", () => {
  it("writes ordered chunks to a temporary path and atomically commits after digest verification", async () => {
    const root = await mkdtemp(join(tmpdir(), "citadela-stream-"));
    const content = Buffer.from("Citadela distributed transfer");
    const digest = createHash("sha256").update(content).digest("hex");
    const writer = new FileTransferStreamWriter({ temporaryPath: join(root, ".tmp", "file"), destinationPath: join(root, "destination"), expectedDigest: digest });
    await writer.open();
    const first = content.subarray(0, 10);
    const second = content.subarray(10);
    await writer.write({ transferId: "transfer", itemId: "item", sequence: 0, offsetBytes: 0, byteLength: first.length, digest: createHash("sha256").update(first).digest("hex") }, first);
    await writer.write({ transferId: "transfer", itemId: "item", sequence: 1, offsetBytes: first.length, byteLength: second.length, digest: createHash("sha256").update(second).digest("hex") }, second);
    await writer.commit();
    await expect(readFile(join(root, "destination"))).resolves.toEqual(content);
  });

  it("rejects out-of-order and corrupted chunks without committing", async () => {
    const root = await mkdtemp(join(tmpdir(), "citadela-stream-"));
    const writer = new FileTransferStreamWriter({ temporaryPath: join(root, "tmp"), destinationPath: join(root, "destination"), expectedDigest: "a".repeat(64) });
    await writer.open();
    const chunk = Buffer.from("chunk");
    const header = { transferId: "transfer", itemId: "item", sequence: 0, offsetBytes: 2, byteLength: chunk.length, digest: "b".repeat(64) };
    await expect(writer.write(header, chunk)).rejects.toBeInstanceOf(FileTransferStreamError);
    await writer.abort();
  });

  it("connects framed chunks to a transfer session and returns verified offsets", async () => {
    const root = await mkdtemp(join(tmpdir(), "citadela-stream-"));
    const content = Buffer.from("session payload");
    const digest = createHash("sha256").update(content).digest("hex");
    const session = new FileTransferSession({ transferId: "transfer", sourceDeviceId: "source", destinationDeviceId: "destination", sourceRootId: "source-root", sourcePath: "source", destinationRootId: "destination-root", destinationPath: "destination", operation: "copy", items: [{ itemId: "item", relativePath: "destination", type: "file", sizeBytes: content.length, modifiedAt: new Date().toISOString() }], totalBytes: content.length, completedBytes: 0, mode: "hub-mediated", conflictPolicy: "ask", state: "created", retryCount: 0, manifestDigest: digest, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }, { temporaryPath: join(root, "tmp"), destinationPath: join(root, "destination") });
    await session.open();
    const { encodeFileTransferFrame } = await import("../src/filesystem/transfer-frame.js");
    const acknowledgement = await session.acceptFrame(encodeFileTransferFrame({ transferId: "transfer", itemId: "item", sequence: 0, offsetBytes: 0, byteLength: content.length, digest }, content));
    expect(acknowledgement.nextOffsetBytes).toBe(content.length);
    await session.commit();
    await expect(readFile(join(root, "destination"))).resolves.toEqual(content);
  });

  it("resumes from a persisted verified offset and commits the complete digest", async () => {
    const root = await mkdtemp(join(tmpdir(), "citadela-stream-resume-"));
    const content = Buffer.from("resumable transfer content");
    const offset = 10;
    const digest = createHash("sha256").update(content).digest("hex");
    const temporaryPath = join(root, "tmp");
    await writeFile(temporaryPath, content.subarray(0, offset));
    const writer = new FileTransferStreamWriter({ temporaryPath, destinationPath: join(root, "destination"), expectedDigest: digest, resumeOffset: offset });
    await writer.open();
    const remaining = content.subarray(offset);
    await writer.write({ transferId: "transfer", itemId: "item", sequence: 1, offsetBytes: offset, byteLength: remaining.length, digest: createHash("sha256").update(remaining).digest("hex") }, remaining);
    await writer.commit();
    await expect(readFile(join(root, "destination"))).resolves.toEqual(content);
  });

  it("suspends without deleting the checkpoint data", async () => {
    const root = await mkdtemp(join(tmpdir(), "citadela-stream-suspend-"));
    const temporaryPath = join(root, "tmp");
    const writer = new FileTransferStreamWriter({ temporaryPath, destinationPath: join(root, "destination"), expectedDigest: "a".repeat(64) });
    await writer.open();
    const chunk = Buffer.from("partial");
    await writer.write({ transferId: "transfer", itemId: "item", sequence: 0, offsetBytes: 0, byteLength: chunk.length, digest: createHash("sha256").update(chunk).digest("hex") }, chunk);
    await writer.suspend();
    await expect(readFile(temporaryPath)).resolves.toEqual(chunk);
  });
});
