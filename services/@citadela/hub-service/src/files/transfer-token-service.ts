import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { FileTransferAuthorizationSchema, type FileTransferAuthorization, type FileTransferScope } from "@citadela/protocol";
import type { FileTransferRecord } from "./transfer-repository.js";

export interface FileTransferTokenClaims extends FileTransferAuthorization {
  audience: "citadela-connector";
  deviceId: string;
}

export class FileTransferTokenService {
  public constructor(private readonly secret: Buffer, private readonly ttlMs = 5 * 60 * 1000) {
    if (secret.length < 32) throw new Error("File transfer token secret must be at least 32 bytes");
  }

  public issue(record: FileTransferRecord, deviceId: string): { token: string; claims: FileTransferTokenClaims } {
    if (deviceId !== record.job.sourceDeviceId && deviceId !== record.job.destinationDeviceId) throw new Error("Device is not part of this transfer");
    const issuedAt = new Date();
    const expiresAt = new Date(Math.min(Date.parse(record.job.expiresAt), issuedAt.getTime() + this.ttlMs));
    const scopes: FileTransferScope[] = record.job.operation === "move" ? ["file.read", "file.write", "file.delete"] : ["file.read", "file.write"];
    const claims: FileTransferTokenClaims = { transferId: record.job.transferId, sourceDeviceId: record.job.sourceDeviceId, destinationDeviceId: record.job.destinationDeviceId, scopes, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), nonce: randomBytes(24).toString("hex"), audience: "citadela-connector", deviceId };
    const encoded = encode(claims);
    return { token: `${encoded}.${sign(encoded, this.secret)}`, claims };
  }

  public verify(token: string, expectedDeviceId: string, now = new Date()): FileTransferTokenClaims {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature || !safeSignature(encoded, signature, this.secret)) throw new Error("Invalid file transfer token");
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as FileTransferTokenClaims;
    FileTransferAuthorizationSchema.parse({ transferId: claims.transferId, sourceDeviceId: claims.sourceDeviceId, destinationDeviceId: claims.destinationDeviceId, scopes: claims.scopes, issuedAt: claims.issuedAt, expiresAt: claims.expiresAt, nonce: claims.nonce });
    if (claims.audience !== "citadela-connector" || claims.deviceId !== expectedDeviceId || Date.parse(claims.expiresAt) <= now.getTime()) throw new Error("File transfer token is not valid for this device or time");
    return claims;
  }
}

function encode(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function sign(value: string, secret: Buffer): string { return createHmac("sha256", secret).update(value).digest("base64url"); }
function safeSignature(value: string, received: string, secret: Buffer): boolean {
  const expected = Buffer.from(sign(value, secret));
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
