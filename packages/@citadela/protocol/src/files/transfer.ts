import { z } from "zod";
import {
  FileConflictPolicySchema,
  FileRootIdSchema,
  FileTimestampSchema,
  FileTransferModeSchema,
  RelativeFilePathSchema,
  Sha256DigestSchema,
  TransferIdSchema,
} from "./common.js";
import { FileItemSchema } from "./item.js";

type ManifestItem = z.input<typeof FileItemSchema>;

export async function computeFileManifestDigest(items: readonly ManifestItem[]): Promise<string> {
  const canonicalItems = [...items]
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map((item) => ({
      itemId: item.itemId,
      relativePath: item.relativePath,
      type: item.type,
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
      ...(item.digest === undefined ? {} : { digest: item.digest }),
    }));

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonicalItems)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const FileTransferStateSchema = z.enum([
  "created",
  "preparing",
  "transferring",
  "paused",
  "verifying",
  "committing",
  "completed",
  "cancelled",
  "failed",
  "expired",
]);
export type FileTransferState = z.infer<typeof FileTransferStateSchema>;

const FileTransferTransitions: Readonly<Record<FileTransferState, readonly FileTransferState[]>> = {
  created: ["preparing", "cancelled", "expired", "failed"],
  preparing: ["transferring", "cancelled", "expired", "failed"],
  transferring: ["paused", "verifying", "cancelled", "expired", "failed"],
  paused: ["transferring", "cancelled", "expired", "failed"],
  verifying: ["committing", "cancelled", "expired", "failed"],
  committing: ["completed", "cancelled", "expired", "failed"],
  completed: [],
  cancelled: [],
  failed: ["preparing"],
  expired: [],
};

export function canTransitionFileTransfer(from: FileTransferState, to: FileTransferState): boolean {
  return FileTransferTransitions[from].includes(to);
}

export const FileTransferJobSchema = z.object({
  transferId: TransferIdSchema,
  sourceDeviceId: z.string().trim().min(1),
  destinationDeviceId: z.string().trim().min(1),
  sourceRootId: FileRootIdSchema,
  sourcePath: RelativeFilePathSchema,
  destinationRootId: FileRootIdSchema,
  destinationPath: RelativeFilePathSchema,
  operation: z.enum(["copy", "move"]),
  items: z.array(FileItemSchema).max(1_000_000),
  totalBytes: z.number().int().nonnegative(),
  completedBytes: z.number().int().nonnegative(),
  mode: FileTransferModeSchema,
  conflictPolicy: FileConflictPolicySchema,
  state: FileTransferStateSchema,
  retryCount: z.number().int().nonnegative(),
  checkpoints: z.record(z.string().trim().min(1), z.number().int().nonnegative()).default({}),
  verifiedItemIds: z.array(z.string().trim().min(1)).default([]),
  manifestDigest: Sha256DigestSchema,
  createdAt: FileTimestampSchema,
  expiresAt: FileTimestampSchema,
}).strict().refine((job) => job.completedBytes <= job.totalBytes, {
  message: "Completed bytes cannot exceed total bytes",
  path: ["completedBytes"],
});

export type FileTransferJob = z.infer<typeof FileTransferJobSchema>;

export const FileChunkHeaderSchema = z.object({
  transferId: TransferIdSchema,
  itemId: z.string().trim().min(1),
  sequence: z.number().int().nonnegative(),
  offsetBytes: z.number().int().nonnegative(),
  byteLength: z.number().int().positive().max(16 * 1024 * 1024),
  digest: Sha256DigestSchema,
}).strict();

export type FileChunkHeader = z.infer<typeof FileChunkHeaderSchema>;

export const FileChunkAcknowledgementSchema = z.object({
  transferId: TransferIdSchema,
  itemId: z.string().trim().min(1),
  sequence: z.number().int().nonnegative(),
  nextOffsetBytes: z.number().int().nonnegative(),
}).strict();

export type FileChunkAcknowledgement = z.infer<typeof FileChunkAcknowledgementSchema>;
