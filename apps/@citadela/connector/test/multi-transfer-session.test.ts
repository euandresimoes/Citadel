import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encodeFileTransferFrame } from "../src/filesystem/transfer-frame.js";
import { MultiFileTransferSession } from "../src/filesystem/multi-transfer-session.js";

describe("MultiFileTransferSession", () => {
  it("commits all files only after each item is verified", async () => {
    const root = await mkdtemp(join(tmpdir(), "citadela-multi-"));
    const first = Buffer.from("one"); const second = Buffer.from("two");
    const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
    const session = new MultiFileTransferSession({ transferId: "transfer", sourceDeviceId: "source", destinationDeviceId: "destination", sourceRootId: "source-root", sourcePath: "source", destinationRootId: "destination-root", destinationPath: "destination", operation: "copy", items: [{ itemId: "one", relativePath: "one", type: "file", sizeBytes: 3, modifiedAt: new Date().toISOString(), digest: digest(first) }, { itemId: "two", relativePath: "two", type: "file", sizeBytes: 3, modifiedAt: new Date().toISOString(), digest: digest(second) }], totalBytes: 6, completedBytes: 0, mode: "hub-mediated", conflictPolicy: "overwrite", state: "transferring", retryCount: 0, manifestDigest: "a".repeat(64), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }, { temporaryPath: (id) => join(root, `${id}.part`), destinationPath: (path) => join(root, path) });
    await session.open();
    for (const [itemId, data] of [["one", first], ["two", second]] as const) await session.acceptFrame(encodeFileTransferFrame({ transferId: "transfer", itemId, sequence: 0, offsetBytes: 0, byteLength: data.length, digest: digest(data) }, data));
    await session.commit();
    await expect(readFile(join(root, "one"))).resolves.toEqual(first);
    await expect(readFile(join(root, "two"))).resolves.toEqual(second);
  });
});
