import { z } from "zod";

export const FileErrorCodeSchema = z.enum([
  "file.path.invalid",
  "file.root.not_allowed",
  "file.permission.denied",
  "file.not_found",
  "file.conflict",
  "file.storage.insufficient",
  "file.integrity.mismatch",
  "file.transfer.expired",
  "file.transfer.invalid_state",
  "file.transfer.unauthorized",
  "file.transport.unavailable",
  "file.source.changed",
]);

export type FileErrorCode = z.infer<typeof FileErrorCodeSchema>;

export const FileErrorSchema = z.object({
  code: FileErrorCodeSchema,
  message: z.string().trim().min(1).max(2_000),
  retryable: z.boolean(),
}).strict();

export type FileError = z.infer<typeof FileErrorSchema>;

