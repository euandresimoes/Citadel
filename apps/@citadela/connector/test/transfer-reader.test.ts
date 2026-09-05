import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeFileTransferFrame } from "../src/filesystem/transfer-frame.js";
import { FileTransferStreamReader } from "../src/filesystem/transfer-reader.js";

describe("FileTransferStreamReader", () => {
  it("streams bounded ordered frames and resumes at a verified offset", async () => {
    const root = await mkdtemp(join(tmpdir(), "citadela-reader-"));
    const content = Buffer.from("0123456789abcdef");
    const path = join(root, "source");
    await writeFile(path, content);
    const reader = await FileTransferStreamReader.open({ filePath: path, transferId: "transfer", itemId: "item", chunkBytes: 5 });
    const frames = [];
    for await (const entry of reader.frames()) frames.push(entry);
    expect(frames.map((entry) => decodeFileTransferFrame(entry.frame).payload)).toEqual([content.subarray(0, 5), content.subarray(5, 10), content.subarray(10, 15), content.subarray(15)]);
    const resumed = [];
    for await (const entry of reader.frames(10)) resumed.push(decodeFileTransferFrame(entry.frame).payload);
    expect(resumed).toEqual([content.subarray(10, 15), content.subarray(15)]);
    expect(createHash("sha256").update(Buffer.concat(frames.map((entry) => decodeFileTransferFrame(entry.frame).payload))).digest("hex")).toBe(createHash("sha256").update(content).digest("hex"));
  });
});
