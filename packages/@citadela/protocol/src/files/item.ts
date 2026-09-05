import { z } from "zod";
import { FileItemIdSchema, FileTimestampSchema, RelativeFilePathSchema, Sha256DigestSchema } from "./common.js";

export const FileItemTypeSchema = z.enum(["file", "directory", "symlink"]);
export type FileItemType = z.infer<typeof FileItemTypeSchema>;

export const FileItemSchema = z.object({
  itemId: FileItemIdSchema,
  relativePath: RelativeFilePathSchema,
  type: FileItemTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: FileTimestampSchema,
  mode: z.number().int().nonnegative().optional(),
  digest: Sha256DigestSchema.optional(),
  chunkDigests: z.array(Sha256DigestSchema).max(1_000_000).optional(),
}).strict();

export type FileItem = z.infer<typeof FileItemSchema>;

