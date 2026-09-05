import { z } from "zod";
import {
  FileConflictPolicySchema,
  FileOperationIdSchema,
  FileRootIdSchema,
  RelativeFilePathSchema,
} from "./common.js";

const FileOperationBaseSchema = z.object({
  operationId: FileOperationIdSchema,
  deviceId: z.string().trim().min(1),
  rootId: FileRootIdSchema,
  path: RelativeFilePathSchema,
  conflictPolicy: FileConflictPolicySchema.optional(),
}).strict();

export const FileOperationSchema = z.discriminatedUnion("type", [
  FileOperationBaseSchema.extend({ type: z.literal("list"), cursor: z.string().trim().min(1).optional(), pageSize: z.number().int().min(1).max(10_000).default(500) }),
  FileOperationBaseSchema.extend({ type: z.literal("stat") }),
  FileOperationBaseSchema.extend({ type: z.literal("mkdir") }),
  FileOperationBaseSchema.extend({ type: z.literal("rename"), newName: z.string().trim().min(1).max(255) }),
  FileOperationBaseSchema.extend({ type: z.literal("delete"), recursive: z.boolean().default(false) }),
  FileOperationBaseSchema.extend({ type: z.literal("copy"), destinationRootId: FileRootIdSchema, destinationPath: RelativeFilePathSchema }),
  FileOperationBaseSchema.extend({ type: z.literal("cut"), destinationRootId: FileRootIdSchema, destinationPath: RelativeFilePathSchema }),
  FileOperationBaseSchema.extend({ type: z.literal("paste"), destinationRootId: FileRootIdSchema, destinationPath: RelativeFilePathSchema }),
  FileOperationBaseSchema.extend({ type: z.literal("move"), destinationRootId: FileRootIdSchema, destinationPath: RelativeFilePathSchema }),
  FileOperationBaseSchema.extend({ type: z.literal("upload"), destinationRootId: FileRootIdSchema, destinationPath: RelativeFilePathSchema }),
  FileOperationBaseSchema.extend({ type: z.literal("download") }),
  FileOperationBaseSchema.extend({ type: z.literal("transfer"), destinationDeviceId: z.string().trim().min(1), destinationRootId: FileRootIdSchema, destinationPath: RelativeFilePathSchema }),
]);

export type FileOperation = z.infer<typeof FileOperationSchema>;

