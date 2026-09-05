import { z } from "zod";
import {
  FileChunkAcknowledgementSchema,
  FileChunkHeaderSchema,
  FileErrorSchema,
  FileItemSchema,
  FileOperationSchema,
  FileRootSchema,
  FileTransferJobSchema,
  FileTransferStateSchema,
  TransferIdSchema,
} from "../files/index.js";
import { ProtocolVersionSchema } from "../common/index.js";

const DeviceIdSchema = z.string().trim().min(1);
const BaseDeviceFileMessageSchema = z.object({ protocolVersion: ProtocolVersionSchema, deviceId: DeviceIdSchema, requestId: z.string().trim().min(1).optional() }).strict();
const BaseTransferMessageSchema = z.object({ protocolVersion: ProtocolVersionSchema, transferId: TransferIdSchema }).strict();

export const FileRootsRequestMessageSchema = BaseDeviceFileMessageSchema.extend({
  type: z.literal("file.roots.request"),
});

export const FileRootsResponseMessageSchema = BaseDeviceFileMessageSchema.extend({
  type: z.literal("file.roots.response"),
  roots: z.array(FileRootSchema).max(100),
});

export const FileListRequestMessageSchema = BaseDeviceFileMessageSchema.extend({
  type: z.literal("file.list.request"),
  rootId: z.string().trim().min(1),
  path: z.string().trim().min(1),
  cursor: z.string().trim().min(1).optional(),
  pageSize: z.number().int().min(1).max(10_000).default(500),
});

export const FileListResponseMessageSchema = BaseDeviceFileMessageSchema.extend({
  type: z.literal("file.list.response"),
  rootId: z.string().trim().min(1),
  path: z.string().trim().min(1),
  items: z.array(FileItemSchema).max(10_000),
  nextCursor: z.string().trim().min(1).optional(),
});

export const FileStatRequestMessageSchema = BaseDeviceFileMessageSchema.extend({
  type: z.literal("file.stat.request"),
  rootId: z.string().trim().min(1),
  path: z.string().trim().min(1),
});

export const FileStatResponseMessageSchema = BaseDeviceFileMessageSchema.extend({
  type: z.literal("file.stat.response"),
  item: FileItemSchema,
});

export const FileOperationCreateMessageSchema = BaseDeviceFileMessageSchema.extend({
  type: z.literal("file.operation.create"),
  operation: FileOperationSchema,
});

export const FileOperationAcceptMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.operation.accept"),
  sourceDeviceId: DeviceIdSchema,
  destinationDeviceId: DeviceIdSchema,
});

export const FileOperationProgressMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.operation.progress"),
  state: FileTransferStateSchema,
  completedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  speedBytesPerSecond: z.number().nonnegative(),
  retryCount: z.number().int().nonnegative(),
});

export const FileOperationPauseMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.operation.pause"),
});

export const FileOperationResumeMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.operation.resume"),
});

export const FileOperationCancelMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.operation.cancel"),
  reason: z.string().trim().max(500).optional(),
});

export const FileOperationConflictMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.operation.conflict"),
  sourcePath: z.string().trim().min(1),
  destinationPath: z.string().trim().min(1),
  item: FileItemSchema,
});

export const FileOperationVerifyMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.operation.verify"),
  manifestDigest: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const FileOperationCompletedMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.operation.completed"),
  itemId: z.string().trim().min(1),
  job: FileTransferJobSchema.optional(),
});

export const FileOperationFailedMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.operation.failed"),
  error: FileErrorSchema,
});

export const FileTransferOpenMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.transfer.open"),
  deviceId: DeviceIdSchema,
  rootId: z.string().trim().min(1),
  path: z.string().trim().min(1),
  itemId: z.string().trim().min(1),
  direction: z.enum(["read", "write"]),
  conflictPolicy: z.enum(["ask", "overwrite", "skip", "rename", "resume", "fail"]),
  totalBytes: z.number().int().nonnegative(),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  resumeOffset: z.number().int().nonnegative().default(0),
  token: z.string().trim().min(1).optional(),
});

export const FileTransferChunkMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.transfer.chunk"),
  header: FileChunkHeaderSchema,
});

export const FileTransferAckMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.transfer.ack"),
  acknowledgement: FileChunkAcknowledgementSchema,
});

export const FileTransferResumeMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.transfer.resume"),
  itemId: z.string().trim().min(1),
  offsetBytes: z.number().int().nonnegative(),
});

export const FileTransferCommitMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.transfer.commit"),
  itemId: z.string().trim().min(1),
  digest: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const FileTransferCleanupMessageSchema = BaseTransferMessageSchema.extend({
  type: z.literal("file.transfer.cleanup"),
});

export const FileMessageSchema = z.discriminatedUnion("type", [
  FileRootsRequestMessageSchema,
  FileRootsResponseMessageSchema,
  FileListRequestMessageSchema,
  FileListResponseMessageSchema,
  FileStatRequestMessageSchema,
  FileStatResponseMessageSchema,
  FileOperationCreateMessageSchema,
  FileOperationAcceptMessageSchema,
  FileOperationProgressMessageSchema,
  FileOperationPauseMessageSchema,
  FileOperationResumeMessageSchema,
  FileOperationCancelMessageSchema,
  FileOperationConflictMessageSchema,
  FileOperationVerifyMessageSchema,
  FileOperationCompletedMessageSchema,
  FileOperationFailedMessageSchema,
  FileTransferOpenMessageSchema,
  FileTransferChunkMessageSchema,
  FileTransferAckMessageSchema,
  FileTransferResumeMessageSchema,
  FileTransferCommitMessageSchema,
  FileTransferCleanupMessageSchema,
]);

export type FileMessage = z.infer<typeof FileMessageSchema>;
