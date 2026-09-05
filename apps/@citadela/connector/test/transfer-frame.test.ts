import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeFileTransferFrame, encodeFileTransferFrame } from "../src/filesystem/transfer-frame.js";

describe("file transfer binary frames", () => {
  it("round-trips a validated chunk header and payload", () => {
    const payload = Buffer.from("binary payload");
    const frame = encodeFileTransferFrame({ transferId: "transfer", itemId: "item", sequence: 0, offsetBytes: 0, byteLength: payload.length, digest: createHash("sha256").update(payload).digest("hex") }, payload);
    expect(decodeFileTransferFrame(frame)).toMatchObject({ payload });
  });

  it("rejects truncated or tampered frame lengths before processing payload", () => {
    const payload = Buffer.from("payload");
    const frame = encodeFileTransferFrame({ transferId: "transfer", itemId: "item", sequence: 0, offsetBytes: 0, byteLength: payload.length, digest: "a".repeat(64) }, payload);
    frame.writeUInt32BE(frame.readUInt32BE(0) + 1, 0);
    expect(() => decodeFileTransferFrame(frame)).toThrow();
  });
});
