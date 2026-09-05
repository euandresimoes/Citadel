import { FileChunkHeaderSchema, type FileChunkHeader } from "@citadela/protocol";

const LENGTH_BYTES = 4;
const MAX_HEADER_BYTES = 8 * 1024;
const MAX_FRAME_BYTES = 16 * 1024 * 1024 + MAX_HEADER_BYTES + LENGTH_BYTES;

export interface FileTransferFrame { header: FileChunkHeader; payload: Buffer; }

export function encodeFileTransferFrame(header: FileChunkHeader, payload: Uint8Array): Buffer {
  const validated = FileChunkHeaderSchema.parse({ ...header, byteLength: payload.byteLength });
  const headerBytes = Buffer.from(JSON.stringify(validated), "utf8");
  if (headerBytes.byteLength > MAX_HEADER_BYTES) throw new Error("File transfer header is too large");
  const frame = Buffer.allocUnsafe(LENGTH_BYTES + headerBytes.byteLength + payload.byteLength);
  frame.writeUInt32BE(headerBytes.byteLength, 0);
  headerBytes.copy(frame, LENGTH_BYTES);
  Buffer.from(payload).copy(frame, LENGTH_BYTES + headerBytes.byteLength);
  return frame;
}

export function decodeFileTransferFrame(frame: Uint8Array): FileTransferFrame {
  const bytes = Buffer.from(frame);
  if (bytes.byteLength > MAX_FRAME_BYTES || bytes.byteLength < LENGTH_BYTES) throw new Error("Invalid file transfer frame size");
  const headerLength = bytes.readUInt32BE(0);
  if (headerLength === 0 || headerLength > MAX_HEADER_BYTES || LENGTH_BYTES + headerLength > bytes.byteLength) throw new Error("Invalid file transfer header length");
  let header: FileChunkHeader;
  try { header = FileChunkHeaderSchema.parse(JSON.parse(bytes.subarray(LENGTH_BYTES, LENGTH_BYTES + headerLength).toString("utf8"))); }
  catch { throw new Error("Invalid file transfer chunk header"); }
  const payload = bytes.subarray(LENGTH_BYTES + headerLength);
  if (payload.byteLength !== header.byteLength) throw new Error("File transfer frame payload length mismatch");
  return { header, payload };
}
