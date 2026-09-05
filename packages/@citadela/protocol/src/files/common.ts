import { z } from "zod";

const NonBlankIdSchema = z.string().trim().min(1);

export const FileItemIdSchema = NonBlankIdSchema;
export type FileItemId = z.infer<typeof FileItemIdSchema>;

export const FileOperationIdSchema = NonBlankIdSchema;
export type FileOperationId = z.infer<typeof FileOperationIdSchema>;

export const FileRootIdSchema = NonBlankIdSchema;
export type FileRootId = z.infer<typeof FileRootIdSchema>;

export const TransferIdSchema = NonBlankIdSchema;
export type TransferId = z.infer<typeof TransferIdSchema>;

export const Sha256DigestSchema = z.string().regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 hex digest");

export const RelativeFilePathSchema = z.string().trim().min(1).refine((value) => {
  const segments = value.split(/[\\/]/u);
  return !value.startsWith("/")
    && !/^[a-z]:[\\/]/iu.test(value)
    && !value.includes("\0")
    && !segments.includes("..");
}, "Path must remain relative to the selected filesystem root");

export type RelativeFilePath = z.infer<typeof RelativeFilePathSchema>;

export const FileTimestampSchema = z.string().datetime({ offset: true });

export const FileTransferModeSchema = z.enum(["hub-mediated", "direct"]);
export type FileTransferMode = z.infer<typeof FileTransferModeSchema>;

export const FileConflictPolicySchema = z.enum(["ask", "overwrite", "skip", "rename", "resume", "fail"]);
export type FileConflictPolicy = z.infer<typeof FileConflictPolicySchema>;

